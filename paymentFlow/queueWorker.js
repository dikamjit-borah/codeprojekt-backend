const { queue } = require('../utils/vendorQueue');
const db = require('../utils/mongo');
const transactionLock = require('../utils/transactionLock');
const vendorFactory = require('../vendors/vendorFactory');
const socketEmitter = require('../utils/socketEmitter');
const refundService = require('../services/refundService');
const logger = require('../utils/logger');
const { PURCHASE_STATUS, PURCHASE_SUBSTATUS } = require('../utils/constants');

// Define vendor failure substatus values for more detailed tracking
const VENDOR_FAILURE_SUBSTATUS = {
  NETWORK_ERROR: 'VENDOR_NETWORK_ERROR',
  BALANCE_ERROR: 'VENDOR_INSUFFICIENT_BALANCE',
  VALIDATION_ERROR: 'VENDOR_VALIDATION_ERROR',
  SERVER_ERROR: 'VENDOR_SERVER_ERROR',
  TIMEOUT_ERROR: 'VENDOR_TIMEOUT',
  UNKNOWN_ERROR: 'VENDOR_UNKNOWN_ERROR'
};

/**
 * Initialize vendor queue worker
 */
function initializeVendorQueueWorker() {
  // Process purchase-coins jobs
  queue.process('purchase-coins', async (job) => {
    const { transactionId, idempotencyKey } = job.data;
    logger.info(`Processing vendor API job: ${job.id}, transaction: ${transactionId}`);
    
    // Try to acquire lock for this transaction
    const lockAcquired = await transactionLock.acquireLock(transactionId);
    if (!lockAcquired) {
      logger.warn(`Transaction ${transactionId} already being processed, skipping job ${job.id}`);
      return { success: false, reason: 'ALREADY_PROCESSING', skipped: true };
    }
    
    try {
      // Check current transaction state
      const transaction = await db.findOne('transactions', { transactionId });
      
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }
      
      // If transaction is already in a terminal state, just acknowledge
      if (transaction.status === PURCHASE_STATUS.COMPLETED) {
        logger.info(`Transaction ${transactionId} already completed, acknowledging job ${job.id}`);
        return { 
          success: true, 
          reason: 'ALREADY_COMPLETED',
          status: transaction.status,
          subStatus: transaction.subStatus
        };
      }
      
      if (transaction.status === PURCHASE_STATUS.FAILED && 
          !transaction.pendingRetry) {
        logger.info(`Transaction ${transactionId} already failed, acknowledging job ${job.id}`);
        return { 
          success: false, 
          reason: 'ALREADY_FAILED',
          status: transaction.status,
          subStatus: transaction.subStatus
        };
      }
      
      // Process with appropriate vendor
      const result = await processVendorPurchase(transaction, job.attemptsMade);
      return result;
    } catch (error) {
      logger.error(`Error processing vendor job ${job.id} for ${transactionId}: ${error.message}`);
      throw error; // Let Bull handle the retry
    } finally {
      // Always release the lock when done
      await transactionLock.releaseLock(transactionId);
    }
  });
  
  // Handle job failure after all retries
  queue.on('failed', async (job, error) => {
    if (job.attemptsMade >= job.opts.attempts) {
      const { transactionId } = job.data;
      await handleFinalJobFailure(transactionId, error);
    }
  });
  
  logger.info('Vendor queue worker initialized');
}

/**
 * Process vendor purchase using the appropriate vendor
 */
async function processVendorPurchase(transaction, currentAttempt = 0) {
  const { transactionId, spuDetails, playerDetails, vendorId } = transaction;
  const currentRetryCount = transaction.vendorRetryCount || 0;
  
  try {
    // Update transaction to indicate processing attempt
    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          vendorRetryCount: currentRetryCount,
          lastVendorAttempt: new Date(),
          pendingRetry: false
        } 
      }
    );
    
    // Get the appropriate vendor adapter
    const vendor = vendorFactory.getVendor(vendorId);
    
    // First check if transaction already exists with vendor
    try {
      const vendorStatus = await vendor.checkTransactionStatus(transactionId);
      
      if (vendorStatus.success && vendorStatus.exists) {
        logger.info(`Transaction ${transactionId} already processed with vendor, recording result`);
        
        // Update transaction as completed
        await db.updateOne(
          'transactions',
          { transactionId },
          { 
            $set: { 
              status: PURCHASE_STATUS.COMPLETED,
              subStatus: PURCHASE_SUBSTATUS.ITEM_DELIVERED,
              vendorResponse: vendorStatus,
              completedAt: new Date(),
              reconciled: true,
              reconciledAt: new Date(),
              reconciledReason: 'VENDOR_CHECK_SUCCESS'
            } 
          }
        );
        
        // Emit socket update
        emitTransactionUpdate(transactionId, {
          status: PURCHASE_STATUS.COMPLETED,
          subStatus: PURCHASE_SUBSTATUS.ITEM_DELIVERED,
          message: `Successfully purchased coins!`,
          coins: vendorStatus.coinsDelivered || calculateCoinAmount(spuDetails.price, vendorId)
        });
        
        return {
          success: true,
          transactionId,
          coins: vendorStatus.coinsDelivered,
          alreadyProcessed: true
        };
      }
    } catch (checkError) {
      // Continue with regular processing if check fails
      logger.warn(`Couldn't check vendor status for ${transactionId}: ${checkError.message}`);
    }
    
    // Check vendor balance
    const vendorBalance = await vendor.checkBalance();
    const coinAmount = calculateCoinAmount(spuDetails.price, vendorId);
    
    if (coinAmount > vendorBalance) {
      // Insufficient balance, record specific failure
      await recordVendorFailure(
        transaction, 
        VENDOR_FAILURE_SUBSTATUS.BALANCE_ERROR,
        'Insufficient vendor balance',
        false // Not retryable
      );
      
      // Initiate refund
      await handleInsufficientBalance(transaction);
      return { success: false, reason: 'INSUFFICIENT_BALANCE' };
    }
    
    // Build vendor metadata from transaction and game details
    const vendorMetadata = buildVendorMetadata(transaction);
    
    // Call vendor API to purchase coins
    const purchaseResponse = await vendor.purchaseCoins({
      playerId: playerDetails.playerId,
      amount: coinAmount,
      transactionId: transactionId,
      retryCount: currentRetryCount,
      metadata: vendorMetadata
    });
    
    // Check if purchase was successful
    if (!purchaseResponse.success) {
      // Handle purchase failure
      const retryable = purchaseResponse.retryable !== false;
      const maxRetries = 3; // Configure as needed
      
      // Record the failure with appropriate category
      await recordVendorFailure(
        transaction,
        purchaseResponse.errorCategory || VENDOR_FAILURE_SUBSTATUS.UNKNOWN_ERROR,
        purchaseResponse.error || 'Unknown vendor error',
        retryable
      );
      
      // Check if we should retry
      if (retryable && currentRetryCount < maxRetries) {
        // Will be retried by Bull's retry mechanism
        throw new Error(purchaseResponse.error || 'Retryable vendor error');
      } else if (!retryable || currentRetryCount >= maxRetries) {
        // No more retries, mark as permanently failed and refund
        await markVendorPermanentlyFailed(
          transaction, 
          purchaseResponse.error || 'Max retries exceeded'
        );
        return { success: false, reason: 'PERMANENT_FAILURE' };
      }
    }
    
    // Success path - update transaction as completed
    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          status: PURCHASE_STATUS.COMPLETED,
          subStatus: PURCHASE_SUBSTATUS.ITEM_DELIVERED,
          vendorResponse: purchaseResponse,
          completedAt: new Date(),
          vendorRetryCount: currentRetryCount,
          vendorCompletedAt: new Date()
        } 
      }
    );
    
    // Emit socket update
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.COMPLETED,
      subStatus: PURCHASE_SUBSTATUS.ITEM_DELIVERED,
      message: 'Successfully purchased coins!',
      coins: coinAmount
    });
    
    return {
      success: true,
      transactionId,
      orderId: purchaseResponse.vendorTransactionId
    };
  } catch (error) {
    logger.error(`Error processing vendor purchase for ${transactionId}: ${error.message}`);
    
    // Get vendor to categorize the error
    const vendor = vendorFactory.getVendor(transaction.vendorId);
    const errorCategory = vendor ? vendor.categorizeError(error) : VENDOR_FAILURE_SUBSTATUS.UNKNOWN_ERROR;
    
    // Record the failure
    await recordVendorFailure(
      transaction,
      errorCategory,
      error.message,
      vendor ? vendor.isRetryableError(error) : true
    );
    
    // Re-throw to let Bull handle retry logic
    throw error;
  }
}

/**
 * Record a vendor failure
 */
async function recordVendorFailure(transaction, failureSubStatus, errorMessage, retryable) {
  const { transactionId } = transaction;
  const currentRetryCount = transaction.vendorRetryCount || 0;
  
  try {
    // Update transaction with failure details
    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          status: PURCHASE_STATUS.PROCESSING, // Still processing if retryable
          subStatus: failureSubStatus,
          vendorRetryCount: currentRetryCount + 1,
          lastVendorError: errorMessage,
          lastVendorErrorAt: new Date(),
          vendorRetryable: retryable,
          pendingRetry: retryable
        },
        $push: { 
          vendorErrors: {
            timestamp: new Date(),
            error: errorMessage,
            subStatus: failureSubStatus,
            retryCount: currentRetryCount
          }
        }
      }
    );
    
    // Emit socket update with appropriate message
    let userMessage = 'We encountered an issue with your purchase. Please wait while we retry.';
    
    if (!retryable) {
      userMessage = 'We encountered an issue with your purchase. Our team has been notified.';
    }
    
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.PROCESSING,
      subStatus: failureSubStatus,
      message: userMessage,
      retryCount: currentRetryCount + 1
    });
    
  } catch (dbError) {
    logger.error(`Failed to record vendor failure for ${transactionId}: ${dbError.message}`);
  }
}

/**
 * Mark a transaction as permanently failed after all retries
 */
async function markVendorPermanentlyFailed(transaction, finalError) {
  const { transactionId } = transaction;
  
  try {
    // Update transaction as failed
    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          status: PURCHASE_STATUS.FAILED,
          subStatus: PURCHASE_SUBSTATUS.VENDOR_FAILED,
          finalVendorError: finalError,
          failedAt: new Date(),
          refundRequired: true,
          pendingRetry: false
        }
      }
    );
    
    // Emit socket update
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.FAILED,
      subStatus: PURCHASE_SUBSTATUS.VENDOR_FAILED,
      message: 'We were unable to complete your purchase. A refund has been initiated.'
    });
    
    // Initiate refund
    await refundService.initiateRefund(
      transactionId,
      'VENDOR_API_PERMANENT_FAILURE'
    );
    
  } catch (error) {
    logger.error(`Failed to mark vendor permanent failure for ${transactionId}: ${error.message}`);
  }
}

/**
 * Handle insufficient balance case
 */
async function handleInsufficientBalance(transaction) {
  const { transactionId, vendorId } = transaction;
  
  logger.error(`Insufficient balance for vendor ${vendorId}, transaction: ${transactionId}`);
  
  try {
    // Update transaction status
    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          status: PURCHASE_STATUS.FAILED,
          subStatus: VENDOR_FAILURE_SUBSTATUS.BALANCE_ERROR,
          finalVendorError: `Insufficient ${vendorId} balance`,
          failedAt: new Date(),
          refundRequired: true,
          pendingRetry: false
        }
      }
    );
    
    // Emit socket update
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.FAILED,
      subStatus: VENDOR_FAILURE_SUBSTATUS.BALANCE_ERROR,
      message: 'We currently cannot fulfill your purchase. A refund has been initiated.'
    });
    
    // Initiate refund
    await refundService.initiateRefund(
      transactionId,
      'INSUFFICIENT_VENDOR_BALANCE'
    );
    
  } catch (error) {
    logger.error(`Failed to handle insufficient balance for ${transactionId}: ${error.message}`);
    throw error;
  }
}

/**
 * Build vendor-specific metadata from transaction
 */
function buildVendorMetadata(transaction) {
  const { vendorId, playerDetails, spuDetails, gameDetails } = transaction;
  
  // Common metadata fields
  const metadata = {
    gameId: gameDetails?.gameId,
    gameName: gameDetails?.gameName,
  };
  
  // Add vendor-specific fields
  if (vendorId === 'smileone') {
    return {
      ...metadata,
      product: gameDetails?.gameId,
      productId: spuDetails.vendorProductId,
      zoneId: playerDetails.zoneId,
    };
  }
  
  // Add mappings for other vendors as they are implemented
  
  return metadata;
}

/**
 * Calculate coin amount based on price and vendor
 */
function calculateCoinAmount(price, vendorId) {
  const config = require('config');
  
  // Different conversion rates for different vendors
  const conversionRates = {
    'smileone': config.get('brazilianRealToSmilecoin'),
    // Add more vendors as needed
  };
  
  const rate = conversionRates[vendorId] || conversionRates['smileone'];
  return price * rate;
}

/**
 * Handle final job failure after all retries
 */
async function handleFinalJobFailure(transactionId, error) {
  try {
    const transaction = await db.findOne('transactions', { transactionId });
    
    if (!transaction) {
      logger.error(`Cannot handle final failure: Transaction ${transactionId} not found`);
      return;
    }
    
    // Skip if transaction is already in a terminal state
    if (transaction.status === PURCHASE_STATUS.COMPLETED) {
      logger.info(`Transaction ${transactionId} already completed, ignoring final failure`);
      return;
    }
    
    if (transaction.status === PURCHASE_STATUS.FAILED && 
        transaction.refundInitiated) {
      logger.info(`Transaction ${transactionId} already failed and refunded, ignoring final failure`);
      return;
    }
    
    // Mark as failed and initiate refund
    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          status: PURCHASE_STATUS.FAILED,
          subStatus: PURCHASE_SUBSTATUS.VENDOR_FAILED,
          finalVendorError: `Final failure after retries: ${error.message}`,
          failedAt: new Date(),
          refundRequired: true,
          pendingRetry: false
        }
      }
    );
    
    // Emit socket update
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.FAILED,
      subStatus: PURCHASE_SUBSTATUS.VENDOR_FAILED,
      message: 'We were unable to complete your purchase. A refund has been initiated.'
    });
    
    // Initiate refund
    await refundService.initiateRefund(
      transactionId,
      'VENDOR_API_FAILURE_AFTER_RETRIES'
    );
    
  } catch (refundError) {
    logger.error(`Failed to handle final job failure for ${transactionId}: ${refundError.message}`);
    // At this point, we need to alert operations team for manual intervention
  }
}

/**
 * Emit socket update with error handling
 */
function emitTransactionUpdate(transactionId, updateData) {
  try {
    socketEmitter.emit('transaction-update', {
      transactionId,
      ...updateData,
      timestamp: new Date()
    });
  } catch (socketError) {
    logger.warn(`Failed to emit socket update for ${transactionId}: ${socketError.message}`);
  }
}

// Initialize worker when this module is imported
initializeVendorQueueWorker();

module.exports = {
  initializeVendorQueueWorker
};




/** Key Features
This queue worker implementation includes:

1. Distributed Locking: Prevents concurrent processing of the same transaction
2. Idempotency: Ensures operations are not duplicated even if jobs are reprocessed
3. Automatic Retry: Configurable retry logic with exponential backoff
4. Error Categorization: Classifies errors for proper handling and reporting
5. Transaction Status Tracking: Comprehensive status updates with detailed substatus
6. Balance Verification: Checks vendor balance before attempting purchase
7. Reconciliation: Checks if transaction was already processed with vendor
8. Refund Integration: Automatically initiates refunds for failed transactions
9. Real-time Updates: Socket integration for client updates
10. Comprehensive Logging: Detailed logging for debugging and monitoring


To start the worker in your application, just require it in your main file:
    // In your app.js or index.js
    require('./workers/vendorQueueWorker');
This worker is designed to seamlessly integrate with your webhook handler and provides robust processing of vendor API calls with proper error handling and recovery mechanisms.*/