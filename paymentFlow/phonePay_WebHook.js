const db = require('../utils/mongo');
const createHttpError = require('http-errors');
const logger = require('../utils/logger');
const socketEmitter = require('../utils/socketEmitter');
const vendorQueue = require('../utils/vendorQueue');
const phonePeAdapter = require('../vendors/phonePe.adapter');
const { PURCHASE_STATUS, PURCHASE_SUBSTATUS, SPU_TYPES } = require('../utils/constants');

/**
 * Process PhonePe webhook - fully generic implementation
 * @param {Object} headers Request headers containing authorization
 * @param {Object} body Webhook payload
 * @returns {Promise<Object>} Processing result
 */
const processPhonePeWebhook = async (headers, body) => {
  try {
    // Validate webhook signature
    const isValid = await phonePeAdapter.validateCallback(
      headers.authorization,
      body
    );
    
    if (!isValid) {
      logger.error('Invalid PhonePe webhook signature');
      throw createHttpError(401, 'Invalid webhook signature');
    }
    
    // Extract order ID and payment status from the payload
    const merchantOrderId = body.payload.merchantOrderId;
    const paymentStatus = body.payload.state;
    
    if (!merchantOrderId) {
      throw createHttpError(400, 'Missing merchant order ID in webhook payload');
    }
    
    // Extract transaction ID from merchant order ID (format: spuId-transactionId)
    const [spuId, transactionId] = merchantOrderId.split('-');
    
    if (!transactionId) {
      throw createHttpError(400, `Invalid merchant order ID format: ${merchantOrderId}`);
    }
    
    // Fetch transaction
    const transaction = await db.findOne("transactions", { transactionId });
    if (!transaction) {
      throw createHttpError(404, `Transaction not found for ID: ${transactionId}`);
    }
    
    // Update transaction with payment status
    const newStatus = paymentStatus === 'COMPLETED' ? PURCHASE_STATUS.PROCESSING : PURCHASE_STATUS.FAILED;
    const newSubStatus = paymentStatus === 'COMPLETED' ? PURCHASE_SUBSTATUS.PAYMENT_COMPLETED : PURCHASE_SUBSTATUS.PAYMENT_FAILED;
    
    await updateTransactionStatus(
      transactionId,
      newStatus,
      newSubStatus,
      { 
        paymentResponse: body,
        paymentCompletedAt: paymentStatus === 'COMPLETED' ? new Date() : null,
        paymentFailedAt: paymentStatus !== 'COMPLETED' ? new Date() : null
      }
    );
    
    // Emit socket update for payment status
    emitTransactionUpdate(transactionId, {
      status: newStatus,
      subStatus: newSubStatus,
      message: paymentStatus === 'COMPLETED' 
        ? 'Payment successful, processing your order...' 
        : 'Payment failed. Please try again.'
    });
    
    // If payment failed, return early
    if (paymentStatus !== 'COMPLETED') {
      logger.info(`Payment failed for transaction ${transactionId}: ${paymentStatus}`);
      return { success: false, message: 'Payment failed', transactionId };
    }
    
    // Get the appropriate processor for this SPU type
    return await processTransaction(transaction, headers, body);
  } catch (error) {
    logger.error(`Webhook processing error: ${error.message}`, error);
    throw createHttpError(
      error.statusCode || 500,
      `Failed to process webhook: ${error.message}`
    );
  }
};

/**
 * Process transaction based on SPU type - uses dynamic processor lookup
 * @param {Object} transaction Transaction object
 * @param {Object} headers Request headers
 * @param {Object} body Webhook payload
 * @returns {Promise<Object>} Processing result
 */
async function processTransaction(transaction, headers, body) {
  const { transactionId, spuType } = transaction;
  
  try {
    // Get processor based on SPU type
    const processor = getTransactionProcessor(spuType);
    
    if (!processor) {
      throw createHttpError(400, `No processor found for SPU type: ${spuType}`);
    }
    
    // Process the transaction
    return await processor(headers, body, transaction);
  } catch (error) {
    logger.error(`Error processing transaction ${transactionId}: ${error.message}`);
    
    // Update transaction status on error
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.FAILED,
      PURCHASE_SUBSTATUS.VENDOR_FAILED,
      { error: error.message }
    );
    
    // Emit socket update for failure
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.FAILED,
      subStatus: PURCHASE_SUBSTATUS.VENDOR_FAILED,
      message: 'We encountered an issue processing your purchase. Our team has been notified.'
    });
    
    throw error;
  }
}

/**
 * Get the appropriate transaction processor for an SPU type
 * This acts as a registry of processors that can be extended
 * without modifying the webhook handler
 * @param {string} spuType Type of SPU
 * @returns {Function} Processor function
 */
function getTransactionProcessor(spuType) {
  // Processor registry - can be extended without changing webhook code
  const processors = {
    [SPU_TYPES.MERCH]: processMerchPurchase,
    [SPU_TYPES.IGT]: queueInGameItemPurchase,
    // Add new SPU types here without changing webhook code
    // [SPU_TYPES.SUBSCRIPTION]: processSubscriptionPurchase,
    // [SPU_TYPES.GIFT_CARD]: processGiftCardPurchase,
  };
  
  return processors[spuType];
}

/**
 * Process merchandise purchase
 * @param {Object} headers Request headers
 * @param {Object} body Webhook payload
 * @param {Object} transaction Transaction object
 * @returns {Promise<Object>} Processing result
 */
async function processMerchPurchase(headers, body, transaction) {
  const { transactionId } = transaction;
  
  try {
    // Implement merchandise processing here
    // For example, create order in fulfillment system
    
    // Update transaction status
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.COMPLETED,
      PURCHASE_SUBSTATUS.ITEM_DELIVERED,
      { 
        completedAt: new Date(),
        fulfillmentDetails: {
          // Add fulfillment details here
          orderedAt: new Date(),
          status: 'PROCESSING'
        }
      }
    );
    
    // Emit socket update
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.COMPLETED,
      subStatus: PURCHASE_SUBSTATUS.ITEM_DELIVERED,
      message: 'Your order has been confirmed and will be shipped soon!'
    });
    
    return {
      success: true,
      message: 'Merchandise order processed',
      transactionId
    };
  } catch (error) {
    logger.error(`Error processing merch purchase for ${transactionId}: ${error.message}`);
    throw error;
  }
}

/**
 * Queue in-game item purchase for processing by vendor API
 * @param {Object} headers Request headers
 * @param {Object} body Webhook payload
 * @param {Object} transaction Transaction object
 * @returns {Promise<Object>} Processing result
 */
async function queueInGameItemPurchase(headers, body, transaction) {
  const transactionId = transaction.transactionId;
  
  try {
    // Add to vendor API queue
    await vendorQueue.addJob('purchase-coins', {
      transactionId,
      headers,
      body,
      timestamp: new Date()
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });
    
    // Update transaction status to reflect queued state
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.PROCESSING,
      PURCHASE_SUBSTATUS.VENDOR_PROCESSING,
      { queuedAt: new Date() }
    );
    
    // Emit socket update for queued status
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.PROCESSING,
      subStatus: PURCHASE_SUBSTATUS.VENDOR_PROCESSING,
      message: 'Payment confirmed! Purchasing your coins...'
    });
    
    return { 
      success: true, 
      message: 'Payment processed, coin purchase queued',
      transactionId
    };
  } catch (queueError) {
    logger.error(`Failed to queue vendor API call: ${queueError.message}`);
    
    // Update transaction status to reflect queue failure
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.FAILED,
      PURCHASE_SUBSTATUS.VENDOR_FAILED,
      { error: `Queue failure: ${queueError.message}` }
    );
    
    // Emit socket update for failure
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.FAILED,
      subStatus: PURCHASE_SUBSTATUS.VENDOR_FAILED,
      message: 'We encountered an issue processing your purchase. Our team has been notified.'
    });
    
    throw createHttpError(500, `Failed to queue vendor API call: ${queueError.message}`);
  }
}

/**
 * Update transaction status
 * @param {string} transactionId Transaction ID
 * @param {string} status New status
 * @param {string} subStatus New sub-status
 * @param {Object} otherFields Additional fields to update
 * @returns {Promise<void>}
 */
async function updateTransactionStatus(
  transactionId,
  status,
  subStatus,
  otherFields = {}
) {
  await db.updateOne(
    "transactions",
    { transactionId },
    { 
      $set: { 
        status, 
        subStatus, 
        updatedAt: new Date(),
        ...otherFields 
      } 
    }
  );
}

/**
 * Emit socket update with error handling
 * @param {string} transactionId Transaction ID
 * @param {Object} updateData Update data
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

module.exports = {
  processPhonePeWebhook,
  updateTransactionStatus,
  emitTransactionUpdate
};




/**
Enhanced PhonePe Webhook Handler
Here's the enhanced webhook handler code that implements robust payment processing with proper error handling, transaction management, and vendor integration:

Key Features of this Webhook Handler:
1. Signature Validation: Ensures webhooks are authentic by validating signatures
2. Transaction ID Extraction: Extracts transaction ID from merchant order ID
3. Dynamic Processing: Processes different SPU types using a registry pattern
4. Real-time Updates: Emits socket events for real-time client updates
5. Queue Integration: Queues vendor API calls for asynchronous processing
6. Error Handling: Comprehensive error handling with appropriate HTTP status codes
7. Logging: Detailed logging for debugging and monitoring
8. Extensibility: Easy to add new SPU types without changing webhook code

This webhook handler follows a modular design that separates concerns, making it easy to maintain and extend. The registry pattern for transaction processors allows adding new SPU types without modifying the core webhook logic. */