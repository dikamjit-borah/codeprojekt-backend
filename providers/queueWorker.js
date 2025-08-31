const db = require('./mongo');
const smileOneAdapter = require('../vendors/smileOne.adapter');
const logger = require('../utils/logger');
const { checkRedisAvailability } = require('./redis');
const { PURCHASE_STATUS, PURCHASE_SUBSTATUS } = require('../utils/constants');

/**
 * Vendor Queue Worker for Vendor Processing
 * Processes place-order jobs by calling vendor APIs directly
 */

/**
 * Initialize vendor queue worker
 */
async function initializeQueueWorker() {
  logger.info('Initializing vendor queue worker...');

  // Check Redis availability
  
  const isRedisAvailable = await checkRedisAvailability();
  console.log('Redis availability:', isRedisAvailable);
  if(!isRedisAvailable) {
    logger.error('Queue cannot start: Redis is not available.');
    return false; // throw new Error('Redis not available - Queue worker cannot start'); // Stop initialization if Redis is not available
  }

  const { queue } = require('./queue');
  // Test queue connection first
  queue.isReady().then(() => {
    console.log('Queue is ready and connected to Redis');
  }).catch((error) => {
    console.error('Queue connection failed:', error.message);
  });

  // Process place-order jobs
  queue.process('place-order', async (job) => {
    const { transactionId } = job.data;
    logger.info(`Processing job ${job.id} for transaction: ${transactionId}`);

    
    try {
      // Get transaction details
      const transaction = await db.findOne('transactions', { transactionId });
      
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }

      // Check if transaction is already completed
      if (transaction.status === PURCHASE_STATUS.SUCCESS) {
        logger.info(`Transaction ${transactionId} already completed, acknowledging job`);
        return { 
          success: true, 
          reason: 'ALREADY_COMPLETED',
          transactionId 
        };
      }

      // Process the vendor pack purchase
      const result = await processVendorPackPurchase(transaction);
      
      logger.info(`Job ${job.id} completed successfully for transaction ${transactionId}`);
      return result;
      
    } catch (error) {
      logger.error(`Job ${job.id} failed for transaction ${transactionId}: ${error.message}`);
      
      // Update transaction to failed state
      await updateTransactionToFailed(transactionId, error.message);
      
      throw error; // Let Bull handle retries
    }
  });

  // Handle successful job completion
  queue.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed:`, {
      transactionId: result.transactionId,
      success: result.success
    });
  });

  // Handle job failures
  queue.on('failed', (job, error) => {
    logger.error(`Job ${job.id} failed permanently:`, {
      transactionId: job.data.transactionId,
      error: error.message,
      attempts: job.attemptsMade
    });
  });

  // Enhanced error handling
  queue.on('error', (error) => {
    console.error('❌ Queue Error:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port
    });
  });

  // Handle job progress
  queue.on('progress', (job, progress) => {
    logger.info(`Job ${job.id} progress: ${progress}%`);
  });

  logger.info('Pack order worker initialized successfully');
}

/**
 * Process vendor pack purchase using SmileOne adapter
 * @param {Object} transaction Transaction object
 * @returns {Promise<Object>} Processing result
 */
async function processVendorPackPurchase(transaction) {
  const { transactionId, spuDetails, playerDetails, spuId } = transaction;
  
  try {
    logger.info(`Processing vendor purchase for transaction ${transactionId} of spuId ${spuId}`);

    // Update transaction to indicate vendor processing started
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.PROCESSING,
      PURCHASE_SUBSTATUS.VENDOR_PROCESSING,
      { vendorProcessingStartedAt: new Date() }
    );

    logger.info(`Placing order for pack purchase for player ${playerDetails.userid}`);

    // Call SmileOne API to place order
    const vendorResponse = await smileOneAdapter.placeOrder(
      spuDetails.product,
      spuId,
      playerDetails.userid,
      playerDetails.zoneid
    );

    logger.info(`Vendor API call successful for transaction ${transactionId}:`, vendorResponse);

    // Update transaction to completed
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.SUCCESS,
      PURCHASE_SUBSTATUS.ORDER_PLACED,
      { 
        vendorResponse,
        completedAt: new Date(),
        orderPlaced: true
      }
    );

    // Emit socket update for completion
    await emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.SUCCESS,
      subStatus: PURCHASE_SUBSTATUS.ORDER_PLACED,
      stage: 4,
      message: `Successfully placed order for ${spuDetails.name || 'Gaming Pack'}!`
    });

    return {
      success: true,
      transactionId,
      orderPlaced: true,
      vendorResponse
    };

  } catch (error) {
    logger.error(`Vendor processing failed for transaction ${transactionId}: ${error.message}`);
    
    // Update transaction to failed
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.FAILED,
      PURCHASE_SUBSTATUS.VENDOR_FAILED,
      { 
        vendorError: error.message,
        failedAt: new Date()
      }
    );

    // Emit socket update for failure
    await emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.FAILED,
      subStatus: PURCHASE_SUBSTATUS.VENDOR_FAILED,
      stage: 3,
      message: 'Failed to process your purchase. Please contact support.'
    });

    throw error;
  }
}

/**
 * Update transaction status in database
 * @param {string} transactionId Transaction ID
 * @param {string} status New status
 * @param {string} subStatus New sub-status
 * @param {Object} otherFields Additional fields
 */
async function updateTransactionStatus(transactionId, status, subStatus, otherFields = {}) {
  try {
    // Calculate stage based on status
    let stage = 3; // Default to vendor processing stage
    if (status === PURCHASE_STATUS.SUCCESS) {
      stage = 4;
    } else if (status === PURCHASE_STATUS.FAILED) {
      stage = 3; // Failed at vendor processing
    }

    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          status, 
          subStatus, 
          stage,
          updatedAt: new Date(),
          ...otherFields 
        } 
      }
    );

    logger.info(`Transaction ${transactionId} updated to stage ${stage}, status: ${status}, subStatus: ${subStatus}`);
  } catch (error) {
    logger.error(`Failed to update transaction ${transactionId}: ${error.message}`);
    throw error;
  }
}

/**
 * Update transaction to failed state
 * @param {string} transactionId Transaction ID
 * @param {string} errorMessage Error message
 */
async function updateTransactionToFailed(transactionId, errorMessage) {
  try {
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.FAILED,
      PURCHASE_SUBSTATUS.VENDOR_FAILED,
      { 
        error: errorMessage,
        failedAt: new Date()
      }
    );
  } catch (error) {
    logger.error(`Failed to update transaction ${transactionId} to failed state: ${error.message}`);
  }
}

/**
 * Emit socket update with error handling
 * @param {string} transactionId Transaction ID
 * @param {Object} updateData Update data
 */
async function emitTransactionUpdate(transactionId, updateData) {
  try {
    const socketEmitter = require('./socket');
    if (socketEmitter && socketEmitter.initialized) {
      socketEmitter.emitTransactionUpdate(transactionId, {
        ...updateData,
        timestamp: new Date()
      });
    }
  } catch (error) {
    logger.warn(`Failed to emit socket update for ${transactionId}: ${error.message}`);
  }
}

module.exports = {
  initializeQueueWorker,
  processVendorPackPurchase
};
