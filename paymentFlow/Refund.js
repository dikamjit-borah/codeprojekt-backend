const db = require('../utils/mongo');
const logger = require('../utils/logger');
const phonePeAdapter = require('../vendors/phonePe.adapter');
const socketEmitter = require('../utils/socketEmitter');
const { PURCHASE_STATUS, PURCHASE_SUBSTATUS } = require('../utils/constants');

/**
 * Initiate a refund for a failed transaction
 * @param {string} transactionId Transaction ID to refund
 * @param {string} reason Reason for refund
 * @returns {Promise<Object>} Refund result
 */
async function initiateRefund(transactionId, reason) {
  try {
    // Get transaction from database
    const transaction = await db.findOne('transactions', { transactionId });
    
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    
    // Check if already refunded or refund initiated
    if (transaction.refundCompleted) {
      logger.info(`Transaction ${transactionId} already refunded`);
      return { 
        success: true, 
        alreadyRefunded: true,
        transactionId
      };
    }
    
    if (transaction.refundInitiated && !transaction.refundFailed) {
      logger.info(`Refund already initiated for transaction ${transactionId}`);
      return { 
        success: true, 
        refundPending: true,
        transactionId
      };
    }
    
    // Update transaction to mark refund as initiated
    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          refundInitiated: true,
          refundInitiatedAt: new Date(),
          refundReason: reason,
          status: PURCHASE_STATUS.FAILED,
          subStatus: PURCHASE_SUBSTATUS.REFUND_INITIATED
        } 
      }
    );
    
    // Emit socket update
    socketEmitter.emit('transaction-update', {
      transactionId,
      status: PURCHASE_STATUS.FAILED,
      subStatus: PURCHASE_SUBSTATUS.REFUND_INITIATED,
      message: 'We were unable to complete your purchase. A refund has been initiated.',
      timestamp: new Date()
    });
    
    // Get payment details
    const { paymentResponse } = transaction;
    
    if (!paymentResponse) {
      logger.error(`No payment response found for transaction ${transactionId}`);
      await markRefundAsFailed(transactionId, 'No payment response found');
      return { success: false, error: 'No payment response found' };
    }
    
    // Process refund with appropriate payment gateway
    const refundResult = await processRefund(transaction);
    
    if (refundResult.success) {
      await markRefundAsCompleted(transactionId, refundResult);
      return { 
        success: true, 
        refunded: true,
        transactionId,
        refundReference: refundResult.refundId
      };
    } else {
      await markRefundAsFailed(transactionId, refundResult.error);
      return { 
        success: false, 
        error: refundResult.error,
        transactionId
      };
    }
  } catch (error) {
    logger.error(`Error initiating refund for ${transactionId}: ${error.message}`);
    
    // Try to mark refund as failed
    try {
      await markRefundAsFailed(transactionId, error.message);
    } catch (markError) {
      logger.error(`Error marking refund as failed: ${markError.message}`);
    }
    
    throw error;
  }
}

/**
 * Process refund with appropriate payment gateway
 * @param {Object} transaction Transaction object
 * @returns {Promise<Object>} Refund result
 */
async function processRefund(transaction) {
  const { transactionId, paymentResponse } = transaction;
  
  try {
    // Determine payment gateway from transaction
    // Currently we only support PhonePe
    const paymentGateway = transaction.paymentGateway || 'PHONEPE';
    
    if (paymentGateway === 'PHONEPE') {
      // Extract PhonePe order ID
      const orderId = paymentResponse.payload.orderId;
      
      if (!orderId) {
        throw new Error('No order ID found in payment response');
      }
      
      // Call PhonePe refund API
      const refundResult = await phonePeAdapter.refund({
        orderId,
        transactionId,
        amount: transaction.spuDetails.price * 100, // Convert to paisa
        reason: transaction.refundReason || 'Transaction failed'
      });
      
      if (refundResult.success) {
        return {
          success: true,
          refundId: refundResult.refundId,
          gateway: 'PHONEPE',
          gatewayResponse: refundResult
        };
      } else {
        throw new Error(refundResult.error || 'PhonePe refund failed');
      }
    } else {
      throw new Error(`Unsupported payment gateway: ${paymentGateway}`);
    }
  } catch (error) {
    logger.error(`Error processing refund for ${transactionId}: ${error.message}`);
    return {
      success: false,
      error: error.message,
      errorDetails: error
    };
  }
}

/**
 * Mark a refund as completed
 * @param {string} transactionId Transaction ID
 * @param {Object} refundResult Refund result from payment gateway
 */
async function markRefundAsCompleted(transactionId, refundResult) {
  await db.updateOne(
    'transactions',
    { transactionId },
    { 
      $set: { 
        refundCompleted: true,
        refundCompletedAt: new Date(),
        status: PURCHASE_STATUS.REFUNDED,
        subStatus: PURCHASE_SUBSTATUS.REFUND_COMPLETED,
        refundResponse: refundResult
      } 
    }
  );
  
  // Emit socket update
  socketEmitter.emit('transaction-update', {
    transactionId,
    status: PURCHASE_STATUS.REFUNDED,
    subStatus: PURCHASE_SUBSTATUS.REFUND_COMPLETED,
    message: 'Your payment has been refunded.',
    timestamp: new Date()
  });
  
  logger.info(`Refund completed for transaction ${transactionId}`);
}

/**
 * Mark a refund as failed
 * @param {string} transactionId Transaction ID
 * @param {string} error Error message
 */
async function markRefundAsFailed(transactionId, error) {
  await db.updateOne(
    'transactions',
    { transactionId },
    { 
      $set: { 
        refundFailed: true,
        refundFailedAt: new Date(),
        refundFailureReason: error,
        status: PURCHASE_STATUS.FAILED,
        subStatus: PURCHASE_SUBSTATUS.REFUND_FAILED
      } 
    }
  );
  
  // Emit socket update
  socketEmitter.emit('transaction-update', {
    transactionId,
    status: PURCHASE_STATUS.FAILED,
    subStatus: PURCHASE_SUBSTATUS.REFUND_FAILED,
    message: 'We encountered an issue processing your refund. Our team has been notified.',
    timestamp: new Date()
  });
  
  logger.error(`Refund failed for transaction ${transactionId}: ${error}`);
}

/**
 * Process refund webhook from payment gateway
 * @param {Object} headers Request headers
 * @param {Object} body Webhook payload
 * @returns {Promise<Object>} Processing result
 */
async function processRefundWebhook(headers, body) {
  try {
    // Validate webhook signature
    const isValid = await phonePeAdapter.validateCallback(
      headers.authorization,
      body
    );
    
    if (!isValid) {
      logger.error('Invalid PhonePe refund webhook signature');
      throw new Error('Invalid webhook signature');
    }
    
    // Extract transaction ID from payload
    const merchantOrderId = body.payload.merchantOrderId;
    const [spuId, transactionId] = merchantOrderId.split('-');
    
    if (!transactionId) {
      throw new Error(`Invalid merchant order ID format: ${merchantOrderId}`);
    }
    
    // Get refund status
    const refundStatus = body.payload.refundState;
    
    // Update transaction based on refund status
    if (refundStatus === 'COMPLETED') {
      await markRefundAsCompleted(transactionId, {
        success: true,
        refundId: body.payload.refundId,
        gateway: 'PHONEPE',
        gatewayResponse: body
      });
      
      return { success: true, status: 'COMPLETED', transactionId };
    } else if (refundStatus === 'FAILED') {
      await markRefundAsFailed(transactionId, body.payload.refundMessage || 'Refund failed');
      
      return { success: false, status: 'FAILED', transactionId };
    } else {
      // For pending or other states, just log and return
      logger.info(`Refund status update for ${transactionId}: ${refundStatus}`);
      
      return { success: true, status: refundStatus, transactionId };
    }
  } catch (error) {
    logger.error(`Error processing refund webhook: ${error.message}`);
    throw error;
  }
}

module.exports = {
  initiateRefund,
  processRefundWebhook
};