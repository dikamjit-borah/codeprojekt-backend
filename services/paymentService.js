const config = require("config");
const db = require("../utils/mongo");
const createHttpError = require("http-errors");
const UUID = require("uuid");
const brazilianRealToSmileCoin = config.get("brazilianRealToSmilecoin");
const smileOneAdapter = require("../vendors/smileOne.adapter");
const phonePeAdapter = require("../vendors/phonePe.adapter");
const {
  PURCHASE_STATUS,
  PURCHASE_SUBSTATUS,
  SPU_TYPES,
} = require("../utils/constants");
const logger = require("../utils/logger");

const purchaseSPU = async (
  spuId,
  spuDetails,
  spuType,
  userDetails,
  playerDetails,
  statusPageRedirectUrl
) => {
  const transactionId = UUID.v4();

  try {
    const additionalFields = await validateSPUType(
      spuType,
      spuDetails,
      playerDetails
    );

    // Create initial transaction entry
    await db.insertOne("transactions", {
      transactionId,
      spuId,
      spuDetails,
      spuType,
      userDetails,
      status: PURCHASE_STATUS.PENDING,
      subStatus: PURCHASE_SUBSTATUS.ORDER_INITIATED,
      ...additionalFields,
    });

    let gatewayResponse;
    try {
      gatewayResponse = await initiateGatewayPayment(
        `${spuId}-${transactionId}`,
        spuDetails.price, statusPageRedirectUrl
      );
    } catch (gatewayError) {
      await updateTransactionStatus(
        transactionId,
        PURCHASE_STATUS.FAILED,
        PURCHASE_SUBSTATUS.GATEWAY_FAILED
      );
      throw createHttpError(
        502,
        `Payment gateway initiation failed: ${gatewayError.message}`
      );
    }

    // Update status after successful gateway init
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.PENDING,
      PURCHASE_SUBSTATUS.GATEWAY_INITIATED,
      { gatewayResponse }
    );

    return {
      transactionId,
      phonePayRedirectUrl: gatewayResponse.redirectUrl,
    };
  } catch (error) {
    throw createHttpError(
      error.statusCode || 500,
      `Failed to process SPU purchase: ${error.message}`
    );
  }
};

async function validateSPUType(spuType, spuDetails, playerDetails) {
  switch (spuType) {
    case SPU_TYPES.MERCH:
      return {};

    case SPU_TYPES.IGT: {
      if (!(await hasSufficientSmileCoin(spuDetails)))
        throw createHttpError(402, "Insufficient Smile Coin balance");

      return { playerDetails };
    }

    default:
      throw createHttpError(400, `Unsupported SPU type: ${spuType}`);
  }
}

  async function hasSufficientSmileCoin(spuDetails) {
  try {
    const smileOneBalance = await smileOneAdapter.fetchSmilecoinBalance();
    const priceInSmileCoin = spuDetails.price * brazilianRealToSmileCoin;
    logger.info(`Smile Coin balance: ${smileOneBalance}, Price in Smile Coin: ${priceInSmileCoin}`);

    if (priceInSmileCoin > smileOneBalance) {
      return false; // Insufficient balance
    }
    return true;
  } catch (error) {
    logger.error(`Failed to fetch Smile Coin balance: ${error.message}`);
    return false; // Assume insufficient balance on error
  }
}
async function initiateGatewayPayment(merchantOrderId, amount, statusPageRedirectUrl) {
  try {
    const response = await phonePeAdapter.pay({
      merchantOrderId,
      amount,
      statusPageRedirectUrl,
    });
    return response;
  } catch (error) {
    logger.error(`Failed to initiate gateway payment: ${error.message}`);
    throw createHttpError(502, `Payment gateway initiation failed: ${error.message}`);
  }
}

async function updateTransactionStatus(
  transactionId,
  status,
  subStatus,
  otherFields
) {
  await db.updateOne(
    "transactions",
    { transactionId },
    { $set: { status, subStatus, ...otherFields } }
  );
}

/**
 * Process PhonePe webhook - main entry point for webhook processing
 * @param {Object} headers Request headers containing authorization
 * @param {Object} body Webhook payload
 * @returns {Promise<Object>} Processing result
 */
const processPhonePeWebhook = async (headers, body) => {
  try {
    //Validate webhook signature
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

    logger.info(`Received PhonePe webhook for order ${merchantOrderId} with status ${paymentStatus}`);

    // return body.payload;
    
    if (!merchantOrderId) {
      throw createHttpError(400, 'Missing merchant order ID in webhook payload');
    }
    
    // Extract transaction ID from merchant order ID (format: spuId-transactionId)
    const parts = merchantOrderId.split('-');
    const spuId = parts[0]; // 'test'
    const transactionId = parts.slice(1).join('-');

    if (!transactionId) {
      throw createHttpError(400, `Invalid merchant order ID format: ${merchantOrderId}`);
    }
    
    // Fetch transaction
    const transaction = await db.findOne("transactions", { transactionId });
    if (!transaction) {
      throw createHttpError(404, `Transaction not found for ID: ${transactionId}`);
    }
    
    
    // To do: Need to correct the structure
    await updateTransactionWithStage(
      transactionId,
      PURCHASE_STATUS.PROCESSING,
      paymentStatus === 'COMPLETED' ? PURCHASE_SUBSTATUS.PAYMENT_SUCCESS : PURCHASE_SUBSTATUS.PAYMENT_FAILED,
      paymentStatus === 'COMPLETED' ? 3 : 2, // Stage 3 for successful payment, Stage 2 for failed
      { 
        paymentResponse: body,
        paymentCompletedAt: paymentStatus === 'COMPLETED' ? new Date() : null,
        paymentFailedAt: paymentStatus !== 'COMPLETED' ? new Date() : null
      }
    );
    
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
    await updateTransactionWithStage(
      transactionId,
      PURCHASE_STATUS.FAILED,
      PURCHASE_SUBSTATUS.VENDOR_FAILED,
      3, // Failed at stage 3 (vendor processing)
      { error: error.message }
    );
    
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
    // For now, we'll mark it as completed since merch doesn't need vendor processing
    
    // Update transaction status
    await updateTransactionWithStage(
      transactionId,
      PURCHASE_STATUS.SUCCESS,
      PURCHASE_SUBSTATUS.ORDER_PLACED,
      4, // Stage 4 - Completed
      { 
        completedAt: new Date(),
        fulfillmentDetails: {
          orderedAt: new Date(),
          status: 'PROCESSING'
        }
      }
    );
    
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
    // Import vendor queue utility
    const vendorQueue = require('../utils/vendorQueue');
    
    // Add to vendor API queue for pack purchase
    const job = await vendorQueue.addJob('place-order', {
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

    logger.info(`Queued vendor API call for transaction ${transactionId}, job ID: ${job.id}`);
    
    // Update transaction status to reflect queued state
    await updateTransactionWithStage(
      transactionId,
      PURCHASE_STATUS.PROCESSING,
      PURCHASE_SUBSTATUS.VENDOR_QUEUED,
      3, // Stage 3 - Vendor processing
      { queuedAt: new Date() }
    );
    
    return { 
      success: true, 
      message: 'Payment processed, pack purchase queued',
      transactionId
    };
  } catch (queueError) {
    logger.error(`Failed to queue vendor API call: ${queueError.message}`);
    
    // Update transaction status to reflect queue failure
    await updateTransactionWithStage(
      transactionId,
      PURCHASE_STATUS.FAILED,
      PURCHASE_SUBSTATUS.VENDOR_FAILED,
      3, // Failed at stage 3
      { error: `Queue failure: ${queueError.message}` }
    );
    
    throw createHttpError(500, `Failed to queue vendor API call: ${queueError.message}`);
  }
}

async function getTransactionStatus(transactionId) {
  try {
    const transaction = await db.findOne("transactions", { transactionId });
    
    if (!transaction) {
      throw createHttpError(404, "Transaction not found");
    }

    // Calculate stage based on status and substatus
    let stage = 1;
    if (transaction.status === PURCHASE_STATUS.PENDING) {
      switch (transaction.subStatus) {
        case PURCHASE_SUBSTATUS.ORDER_INITIATED:
          stage = 1;
          break;
        case PURCHASE_SUBSTATUS.GATEWAY_INITIATED:
        case PURCHASE_SUBSTATUS.PAYMENT_IN_PROGRESS:
          stage = 2;
          break;
        case PURCHASE_SUBSTATUS.PAYMENT_SUCCESS:
        case PURCHASE_SUBSTATUS.ORDER_PLACED:
          stage = 3;
          break;
      }
    } else if (transaction.status === PURCHASE_STATUS.SUCCESS) {
      stage = 4;
    } else if (transaction.status === PURCHASE_STATUS.FAILED) {
      stage = transaction.stage || 1; // Maintain the stage where it failed
    }

    return {
      transactionId,
      status: transaction.status,
      subStatus: transaction.subStatus,
      stage,
      spuId: transaction.spuId,
      spuType: transaction.spuType,
      spuDetails: transaction.spuDetails,
      userDetails: transaction.userDetails,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      lastUpdated: transaction.updatedAt || transaction.createdAt
    };
  } catch (error) {
    logger.error(`Failed to get transaction status: ${error.message}`);
    throw error;
  }
}

async function updateTransactionWithStage(transactionId, status, subStatus, stage, otherFields = {}) {
  try {
    await db.updateOne(
      "transactions",
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
    
    // Emit socket event for real-time updates
    const socketEmitter = require("../utils/socketEmitter");
    if (socketEmitter.initialized) {
      socketEmitter.emitTransactionUpdate(transactionId, {
        status,
        subStatus,
        stage,
        ...otherFields
      });
    }
    
    logger.info(`Transaction ${transactionId} updated to stage ${stage}, status: ${status}, subStatus: ${subStatus}`);
  } catch (error) {
    logger.error(`Failed to update transaction: ${error.message}`);
    throw error;
  }
}
module.exports = {
  purchaseSPU,
  processPhonePeWebhook,
  getTransactionStatus,
  updateTransactionWithStage,
};
