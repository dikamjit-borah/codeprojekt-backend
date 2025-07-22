const db = require('../utils/mongo');
const vendorFactory = require('../vendors/vendorFactory');
const socketEmitter = require('../utils/socketEmitter');
const vendorQueue = require('../utils/vendorQueue');
const logger = require('../utils/logger');
const adminNotifier = require('../utils/adminNotifier');
const { PURCHASE_STATUS, PURCHASE_SUBSTATUS } = require('../utils/constants');

/**
 * Get the current status of a transaction
 * @param {string} transactionId The transaction ID to check
 * @param {boolean} detailed Whether to include detailed information
 * @returns {Promise<Object>} Transaction status information
 */
async function getTransactionStatus(transactionId, detailed = false) {
  try {
    // Get transaction from database
    const transaction = await db.findOne('transactions', { transactionId });
    
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    
    // Basic status response
    const statusResponse = {
      transactionId,
      status: transaction.status,
      subStatus: transaction.subStatus,
      lastUpdated: transaction.updatedAt || transaction.createdAt,
      spuId: transaction.spuId,
      spuType: transaction.spuType
    };
    
    // Add detailed information if requested
    if (detailed) {
      statusResponse.vendorId = transaction.vendorId;
      statusResponse.createdAt = transaction.createdAt;
      statusResponse.completedAt = transaction.completedAt;
      statusResponse.failedAt = transaction.failedAt;
      statusResponse.vendorRetryCount = transaction.vendorRetryCount || 0;
      statusResponse.reconciliationNeeded = transaction.reconciliationNeeded || false;
      
      // Only include payment and error details for admins/internal use
      statusResponse.paymentDetails = {
        orderId: transaction.orderId,
        amount: transaction.spuDetails?.price,
        currency: transaction.spuDetails?.currency
      };
      
      if (transaction.lastVendorError) {
        statusResponse.lastError = {
          message: transaction.lastVendorError,
          timestamp: transaction.lastVendorErrorAt
        };
      }
      
      if (transaction.refundInitiated) {
        statusResponse.refund = {
          initiated: transaction.refundInitiated,
          initiatedAt: transaction.refundInitiatedAt,
          completed: transaction.refundCompleted || false,
          completedAt: transaction.refundCompletedAt
        };
      }
    }
    
    // Check if transaction appears stuck and needs reconciliation
    const needsReconciliation = checkIfNeedsReconciliation(transaction);
    if (needsReconciliation && !transaction.reconciliationNeeded) {
      await markForReconciliation(transaction);
      statusResponse.reconciliationNeeded = true;
    } else if (transaction.reconciliationNeeded) {
      statusResponse.reconciliationNeeded = true;
      statusResponse.reconciliationMarkedAt = transaction.reconciliationMarkedAt;
    }
    
    return statusResponse;
  } catch (error) {
    logger.error(`Error getting transaction status for ${transactionId}: ${error.message}`);
    throw error;
  }
}

/**
 * Check if a transaction needs reconciliation
 * @param {Object} transaction Transaction object
 * @returns {boolean} Whether reconciliation is needed
 */
function checkIfNeedsReconciliation(transaction) {
  const { status, subStatus, createdAt, updatedAt, reconciliationNeeded } = transaction;
  
  // Don't re-evaluate if already marked
  if (reconciliationNeeded) {
    return false;
  }
  
  // Don't reconcile if already in terminal state
  if (status === PURCHASE_STATUS.COMPLETED || status === PURCHASE_STATUS.FAILED) {
    return false;
  }
  
  // Check if transaction is stuck in processing state for too long
  const lastUpdate = updatedAt || createdAt;
  const minutesSinceUpdate = (Date.now() - new Date(lastUpdate)) / (1000 * 60);
  
  // Need reconciliation if no updates for 5+ minutes and in processing state
  return status === PURCHASE_STATUS.PROCESSING && minutesSinceUpdate > 5;
}

/**
 * Mark a transaction as needing reconciliation and notify admin
 * @param {Object} transaction Transaction object
 * @returns {Promise<Object>} Result of marking
 */
async function markForReconciliation(transaction) {
  const { transactionId } = transaction;
  
  try {
    logger.info(`Marking transaction ${transactionId} as needing reconciliation`);
    
    // Update transaction to indicate it needs reconciliation
    await db.updateOne(
      'transactions',
      { transactionId },
      {
        $set: {
          reconciliationNeeded: true,
          reconciliationMarkedAt: new Date(),
          subStatus: PURCHASE_SUBSTATUS.RECONCILIATION_NEEDED
        }
      }
    );
    
    // Notify administrators
    await notifyAdminsAboutReconciliation(transaction);
    
    return { success: true, markedForReconciliation: true };
  } catch (error) {
    logger.error(`Failed to mark transaction ${transactionId} for reconciliation: ${error.message}`);
    throw error;
  }
}

/**
 * Notify administrators about a transaction needing reconciliation
 * @param {Object} transaction Transaction object
 * @returns {Promise<void>}
 */
async function notifyAdminsAboutReconciliation(transaction) {
  const { transactionId, spuType, spuDetails, userDetails } = transaction;
  
  try {
    // Prepare notification data
    const notificationData = {
      type: 'RECONCILIATION_NEEDED',
      transactionId,
      spuType,
      productName: spuDetails?.name || 'Unknown product',
      price: spuDetails?.price || 0,
      currency: spuDetails?.currency || 'BRL',
      userEmail: userDetails?.email || 'Unknown user',
      timestamp: new Date(),
      link: `/admin/transactions/${transactionId}`,
      message: `Transaction ${transactionId} is stuck and needs reconciliation`
    };
    
    // Send notification to admins
    await adminNotifier.sendNotification(notificationData);
    
    // Also log for audit trail
    logger.info(`Admin notification sent for transaction ${transactionId} reconciliation`);
  } catch (error) {
    logger.error(`Failed to notify admins about transaction ${transactionId}: ${error.message}`);
    // Don't throw - notification failure shouldn't block the process
  }
}

/**
 * Trigger reconciliation process for a transaction - called by admin action
 * @param {Object} transaction Transaction object
 * @param {Object} adminUser Admin user who triggered reconciliation
 * @returns {Promise<Object>} Reconciliation result
 */
async function triggerReconciliation(transaction, adminUser) {
  const { transactionId, vendorId, spuType } = transaction;
  
  try {
    logger.info(`Admin ${adminUser.email} triggered reconciliation for transaction ${transactionId}`);
    
    // Update transaction to indicate reconciliation is in progress
    await db.updateOne(
      'transactions', 
      { transactionId },
      {
        $set: {
          reconciliationTriggered: true,
          reconciliationTriggeredAt: new Date(),
          reconciliationTriggeredBy: adminUser.email,
          subStatus: PURCHASE_SUBSTATUS.RECONCILIATION_PROCESSING
        }
      }
    );
    
    // For vendor purchases, check status with vendor
    if (spuType === 'IGT') {
      const vendor = vendorFactory.getVendor(vendorId);
      
      try {
        const vendorStatus = await vendor.checkTransactionStatus(transactionId);
        
        if (vendorStatus.exists) {
          if (vendorStatus.success) {
            // Transaction succeeded on vendor side but not updated in our system
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
                  reconciledReason: 'ADMIN_RECONCILIATION_SUCCESS',
                  reconciledBy: adminUser.email,
                  reconciliationNeeded: false
                } 
              }
            );
            
            // Emit socket update
            emitTransactionUpdate(transactionId, {
              status: PURCHASE_STATUS.COMPLETED,
              subStatus: PURCHASE_SUBSTATUS.ITEM_DELIVERED,
              message: 'Your purchase was successful!',
              reconciled: true
            });
            
            // Notify admin about successful reconciliation
            await adminNotifier.sendNotification({
              type: 'RECONCILIATION_COMPLETED',
              transactionId,
              result: 'SUCCESS',
              adminEmail: adminUser.email,
              timestamp: new Date()
            });
            
            return { 
              reconciled: true, 
              action: 'MARKED_COMPLETED',
              vendorStatus
            };
          } else {
            // Transaction exists but failed on vendor side
            await db.updateOne(
              'transactions',
              { transactionId },
              { 
                $set: { 
                  status: PURCHASE_STATUS.FAILED,
                  subStatus: PURCHASE_SUBSTATUS.VENDOR_FAILED,
                  vendorResponse: vendorStatus,
                  failedAt: new Date(),
                  reconciled: true,
                  reconciledAt: new Date(),
                  reconciledReason: 'ADMIN_RECONCILIATION_FAILED',
                  reconciledBy: adminUser.email,
                  reconciliationNeeded: false,
                  refundRequired: true
                } 
              }
            );
            
            // Emit socket update
            emitTransactionUpdate(transactionId, {
              status: PURCHASE_STATUS.FAILED,
              subStatus: PURCHASE_SUBSTATUS.VENDOR_FAILED,
              message: 'We were unable to complete your purchase. A refund will be initiated.',
              reconciled: true
            });
            
            // Notify admin about failed reconciliation
            await adminNotifier.sendNotification({
              type: 'RECONCILIATION_COMPLETED',
              transactionId,
              result: 'FAILED',
              adminEmail: adminUser.email,
              timestamp: new Date()
            });
            
            return { 
              reconciled: true, 
              action: 'MARKED_FAILED',
              vendorStatus
            };
          }
        } else {
          // Transaction doesn't exist with vendor - requeue if it was payment confirmed
          if (transaction.subStatus === PURCHASE_SUBSTATUS.PAYMENT_COMPLETED) {
            await requeueTransaction(transaction, adminUser);
            return { 
              reconciled: true, 
              action: 'REQUEUED',
              triggeredBy: adminUser.email
            };
          }
        }
      } catch (vendorError) {
        logger.error(`Vendor status check failed during admin reconciliation: ${vendorError.message}`);
        
        // Update transaction with error
        await db.updateOne(
          'transactions',
          { transactionId },
          { 
            $set: { 
              reconciliationError: vendorError.message,
              reconciliationErrorAt: new Date()
            } 
          }
        );
        
        // Notify admin about reconciliation error
        await adminNotifier.sendNotification({
          type: 'RECONCILIATION_ERROR',
          transactionId,
          error: vendorError.message,
          adminEmail: adminUser.email,
          timestamp: new Date()
        });
        
        return { 
          reconciled: false, 
          action: 'VENDOR_CHECK_FAILED',
          error: vendorError.message
        };
      }
    }
    
    // For non-vendor purchases or if vendor check failed
    return { reconciled: false, action: 'NO_ACTION_NEEDED' };
  } catch (error) {
    logger.error(`Error during admin reconciliation for ${transactionId}: ${error.message}`);
    throw error;
  }
}

/**
 * Cancel a transaction and issue refund - called by admin action
 * @param {Object} transaction Transaction object
 * @param {Object} adminUser Admin user who triggered cancellation
 * @param {string} reason Reason for cancellation
 * @returns {Promise<Object>} Cancellation result
 */
async function cancelTransaction(transaction, adminUser, reason) {
  const { transactionId } = transaction;
  
  try {
    logger.info(`Admin ${adminUser.email} cancelling transaction ${transactionId}: ${reason}`);
    
    // Update transaction status
    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          status: PURCHASE_STATUS.FAILED,
          subStatus: PURCHASE_SUBSTATUS.ADMIN_CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: adminUser.email,
          cancellationReason: reason,
          reconciliationNeeded: false,
          refundRequired: true
        } 
      }
    );
    
    // Emit socket update
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.FAILED,
      subStatus: PURCHASE_SUBSTATUS.ADMIN_CANCELLED,
      message: 'Your transaction has been cancelled. A refund will be processed.',
      cancelled: true
    });
    
    // Initiate refund process
    const refundService = require('./refundService');
    const refundResult = await refundService.initiateRefund(
      transactionId,
      `ADMIN_CANCELLED: ${reason}`
    );
    
    // Notify admin about cancellation
    await adminNotifier.sendNotification({
      type: 'TRANSACTION_CANCELLED',
      transactionId,
      reason,
      adminEmail: adminUser.email,
      refundInitiated: refundResult.success,
      timestamp: new Date()
    });
    
    return {
      success: true,
      cancelled: true,
      refundInitiated: refundResult.success,
      transactionId
    };
  } catch (error) {
    logger.error(`Error cancelling transaction ${transactionId}: ${error.message}`);
    
    // Notify admin about cancellation error
    await adminNotifier.sendNotification({
      type: 'CANCELLATION_ERROR',
      transactionId,
      error: error.message,
      adminEmail: adminUser.email,
      timestamp: new Date()
    });
    
    throw error;
  }
}

/**
 * Requeue a transaction for vendor processing
 * @param {Object} transaction Transaction object
 * @param {Object} adminUser Admin user who triggered requeue
 * @returns {Promise<Object>} Requeue result
 */
async function requeueTransaction(transaction, adminUser) {
  const { transactionId } = transaction;
  
  try {
    // Update transaction status
    await db.updateOne(
      'transactions',
      { transactionId },
      { 
        $set: { 
          reconciliationAction: 'REQUEUED',
          reconciliationActionAt: new Date(),
          reconciliationActionBy: adminUser.email,
          reconciliationNeeded: false,
          subStatus: PURCHASE_SUBSTATUS.VENDOR_QUEUED
        } 
      }
    );
    
    // Add to vendor queue
    await vendorQueue.addJob('purchase-coins', {
      transactionId,
      reconciliation: true,
      adminTriggered: true,
      adminEmail: adminUser.email,
      timestamp: new Date()
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });
    
    // Emit socket update
    emitTransactionUpdate(transactionId, {
      status: PURCHASE_STATUS.PROCESSING,
      subStatus: PURCHASE_SUBSTATUS.VENDOR_QUEUED,
      message: 'Processing your purchase...',
      reconciled: true
    });
    
    // Notify admin about requeue
    await adminNotifier.sendNotification({
      type: 'TRANSACTION_REQUEUED',
      transactionId,
      adminEmail: adminUser.email,
      timestamp: new Date()
    });
    
    return { success: true };
  } catch (error) {
    logger.error(`Failed to requeue transaction ${transactionId}: ${error.message}`);
    throw error;
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

module.exports = {
  getTransactionStatus,
  triggerReconciliation,
  cancelTransaction,
  checkIfNeedsReconciliation,
  markForReconciliation
};