const db = require("../providers/mongo");
const createHttpError = require("http-errors");
const UUID = require("uuid");
const smileOneAdapter = require("../vendors/smileOne.adapter");
const phonePeAdapter = require("../vendors/phonePe.adapter");
const matrixSolsAdapter = require("../vendors/matrixSols.adapter");
const {
  PURCHASE_STATUS,
  PURCHASE_SUBSTATUS,
  SPU_TYPES,
  PHONE_PE_WEBHOOK_TYPES,
} = require("../utils/constants");
const logger = require("../utils/logger");
const queueManager = require("../providers/queue.manager");
const socket = require("../providers/socket");
const { fetchAppConfigs } = require("../utils/helpers");

const purchaseSPU = async (
  spuId,
  spuDetails,
  spuType,
  userDetails,
  playerDetails,
  redirectUrl
) => {
  const transactionId = UUID.v4();
  // const redirectUrlWithTransactionId = `${redirectUrl}?transactionId=${transactionId}`
  const redirectUrlWithTransactionId = `${'https://stage.codeprojekt.shop/transaction-status'}`

  try {
    logger.info("Initiating purchase", {
      transactionId,
      spuId,
      spuType,
      amountInINR: spuDetails.price_inr,
    });

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
      redirectUrl: redirectUrlWithTransactionId,
      status: PURCHASE_STATUS.PENDING,
      subStatus: PURCHASE_SUBSTATUS.ORDER_INITIATED,
      ...additionalFields,
    });

    let gatewayResponse = await initiateGatewayPayment(
      spuId,
      transactionId,
      spuDetails.price_inr,
      redirectUrlWithTransactionId
    );

    // Update status after successful gateway init
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.PENDING,
      PURCHASE_SUBSTATUS.GATEWAY_INITIATED,
      { gatewayResponse, orderId: gatewayResponse.orderId, }
    );

    return {
      transactionId,
      gatewayRedirectUrl: gatewayResponse.redirectUrl,
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

    case SPU_TYPES.GAME_ITEM: {
      if (!(await hasSufficientSmileCoin(spuDetails)))
        throw createHttpError(402, "Insufficient balance. Sorry for the inconvenience");

      return { playerDetails };
    }

    default:
      throw createHttpError(400, `Unsupported SPU type: ${spuType}`);
  }
}

async function hasSufficientSmileCoin(spuDetails) {
  try {
    const smileOneBalance = await smileOneAdapter.fetchSmilecoinBalance();
    const brazilianRealToSmileCoin = (await fetchAppConfigs())[0].brazilianRealToSmileCoin;

    const priceInSmileCoin = spuDetails.price * brazilianRealToSmileCoin;
    logger.info(
      `Smile Coin balance: ${smileOneBalance}, Price in Smile Coin: ${priceInSmileCoin}`
    );

    if (priceInSmileCoin > smileOneBalance) {
      return false; // Insufficient balance
    }
    return true;
  } catch (error) {
    logger.error(`Failed to fetch Smile Coin balance: ${error.message}`);
    return false; // Assume insufficient balance on error
  }
}

async function initiateGatewayPayment(
  spuId,
  transactionId,
  priceInInr,
  redirectUrl
) {
  try {
    /*  
    const merchantOrderId = `${spuId}-${transactionId}`
    const priceInPaisa = Math.round(priceInInr * 100); // Convert INR to paise
    const response = await phonePeAdapter.pay({
      merchantOrderId,
      amount: priceInPaisa,
      redirectUrl,
    }); 
    */


    // Matrix Sols adapter implementation
    const response = await matrixSolsAdapter.pay({
      amount: priceInInr,
      redirectUrl,
    });

    return {
      orderId: response.order_id,
      redirectUrl: response.payment_url,
    };
  } catch (error) {
    logger.error(`Failed to initiate gateway payment: ${error.message}`);
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.FAILED,
      PURCHASE_SUBSTATUS.GATEWAY_FAILED
    );
    throw createHttpError(
      502,
      `Payment gateway initiation failed: ${error.message}`
    );
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
    logger.info("Processing PhonePe webhook", { headers, body });
    //Validate webhook signature
    const parsedWebhook = await phonePeAdapter.validateCallback(
      headers.authorization,
      body
    );

    if (!parsedWebhook) {
      logger.error("Invalid PhonePe webhook signature");
      throw createHttpError(401, "Invalid webhook signature");
    }

    // Extract order ID and payment status from the payload
    const merchantOrderId = parsedWebhook.payload.merchantOrderId;
    const paymentStatus = parsedWebhook.type; //parsedWebhook.payload.state

    logger.info(
      `Received PhonePe webhook for order ${merchantOrderId} with status ${paymentStatus}`
    );

    // return body.payload;

    if (!merchantOrderId) {
      throw createHttpError(
        400,
        "Missing merchant order ID in webhook payload"
      );
    }

    // Extract transaction ID from merchant order ID (format: spuId-transactionId)
    const transactionId = merchantOrderId.split("-").slice(1).join("-");

    if (!transactionId) {
      throw createHttpError(
        400,
        `Invalid merchant order ID format: ${merchantOrderId}`
      );
    }

    // Fetch transaction
    const transaction = await db.findOne("transactions", { transactionId });
    if (!transaction) {
      throw createHttpError(
        404,
        `Transaction not found for ID: ${transactionId}`
      );
    }

    const status =
      paymentStatus === PHONE_PE_WEBHOOK_TYPES.ORDER_COMPLETED
        ? PURCHASE_STATUS.PAYMENT_COMPLETED
        : PURCHASE_STATUS.FAILED;

    const subStatus =
      paymentStatus === PHONE_PE_WEBHOOK_TYPES.ORDER_COMPLETED
        ? PURCHASE_SUBSTATUS.PAYMENT_SUCCESS
        : PURCHASE_SUBSTATUS.PAYMENT_FAILED;

    await updateTransactionStatus(transactionId, status, subStatus, {
      paymentResponse: body,
    });

    socket.emit('transaction-update', { transactionId, status, subStatus, stage: 3 }, `transaction:${transactionId}`);
    // If payment failed, return early
    if (paymentStatus !== PHONE_PE_WEBHOOK_TYPES.ORDER_COMPLETED) {
      logger.info(
        `Payment failed for transaction ${transactionId}: ${paymentStatus}`
      );
      return
    }
    // process for the respective SPU type
    return await processTransaction(transaction, parsedWebhook);
  } catch (error) {
    logger.error(`Webhook processing error: ${error.message}`, error);
    throw createHttpError(
      error.statusCode || 500,
      `Failed to process webhook: ${error.message}`
    );
  }
};

/**
 * Process Matrix Sols webhook - main entry point for webhook processing
 * @param {Object} headers Request headers containing authorization
 * @param {Object} body Webhook payload
 * @returns {Promise<Object>} Processing result
 */
const processMatrixSolsWebhook = async (headers, body) => {
  try {
    logger.info("Processing Matrix Sols webhook", { headers, body });

    // Matrix Sols webhook validation
    const signature = headers['x-signature'];
    /*const isValidSignature = await matrixSolsAdapter.validateCallback(
      body,
      signature
    );

    const parsedWebhook = isValidSignature ? await matrixSolsAdapter.handleWebhookNotification(body) : null; 
    */
    const parsedWebhook = await matrixSolsAdapter.handleWebhookNotification(body);

    /* if (!parsedWebhook) {
      logger.error("Invalid Matrix Sols webhook signature");
      throw createHttpError(401, "Invalid webhook signature");
    } */

    // Extract order ID and payment status from the payload
    const orderId = parsedWebhook.orderId;
    const paymentStatus = parsedWebhook.status; // "Success" or other status from Matrix Sols

    logger.info(
      `Received Matrix Sols webhook for order ${orderId} with status ${paymentStatus}`
    );

    if (!orderId) {
      throw createHttpError(
        400,
        "Missing order ID in webhook payload"
      );
    }

    // Fetch transaction from order ID
    const transaction = await db.findOne("transactions", { orderId });
    const transactionId = transaction ? transaction.transactionId : null;
    if (!transaction) {
      throw createHttpError(
        404,
        `Transaction not found for order ID: ${transactionId}`
      );
    }

    // Matrix Sols webhook status mapping
    const status =
      paymentStatus === "Success"
        ? PURCHASE_STATUS.PAYMENT_COMPLETED
        : PURCHASE_STATUS.FAILED;

    const subStatus =
      paymentStatus === "Success"
        ? PURCHASE_SUBSTATUS.PAYMENT_SUCCESS
        : PURCHASE_SUBSTATUS.PAYMENT_FAILED;

    await updateTransactionStatus(transactionId, status, subStatus, {
      paymentResponse: body,
    });

    socket.emit('transaction-update', { transactionId, status, subStatus, stage: 3 }, `transaction:${transactionId}`);
    // If payment failed, return early
    if (paymentStatus !== "Success") {
      logger.info(
        `Payment failed for transaction ${transactionId}: ${paymentStatus}`
      );
      return
    }
    // process for the respective SPU type
    return await processTransaction(transaction, parsedWebhook);
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
async function processTransaction(transaction, parsedWebhook) {
  const { transactionId, spuType } = transaction;
  // Get processor based on SPU type
  const processor = getTransactionProcessor(spuType);

  if (!processor) {
    throw createHttpError(400, `No processor found for SPU type: ${spuType}`);
  }

  // Process the transaction
  return await processor(transactionId, parsedWebhook);
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
    [SPU_TYPES.GAME_ITEM]: queueGameItemPurchase,
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
async function processMerchPurchase(transactionId) {
  // Implement merchandise processing here
  // For now, we'll mark it as completed since merch doesn't need vendor processing

  // Update transaction status
  await updateTransactionStatus(
    transactionId,
    PURCHASE_STATUS.SUCCESS,
    PURCHASE_SUBSTATUS.ORDER_PLACED
  );
  socket.emit('transaction-update', {
    transactionId, status: PURCHASE_STATUS.SUCCESS, subStatus: PURCHASE_SUBSTATUS.ORDER_PLACED, stage: 4
  }, `transaction:${transactionId}`);
}

/**
 * Queue in-game item purchase for processing by vendor API
 * @param {Object} headers Request headers
 * @param {Object} body Webhook payload
 * @param {Object} transaction Transaction object
 * @returns {Promise<Object>} Processing result
 */
async function queueGameItemPurchase(transactionId, parsedWebhook) {
  const job = await queueManager.addJob("game-item-purchase", {
    transactionId,
    parsedWebhook,
  });

  logger.info(
    `Queued vendor API call for transaction ${transactionId}, job ID: ${job.id}`
  );

  // Update transaction status to reflect queued state
  await updateTransactionStatus(
    transactionId,
    PURCHASE_STATUS.PAYMENT_COMPLETED,
    PURCHASE_SUBSTATUS.VENDOR_QUEUED
  );
}

/**
 * Process vendor pack purchase using SmileOne adapter
 * @param {Object} transaction Transaction object
 * @returns {Promise<Object>} Processing result
 */
async function processGameItemPurchase(transaction) {
  const { transactionId, spuDetails, playerDetails, spuId } = transaction;

  try {
    logger.info(
      `Processing vendor purchase for transaction ${transactionId} of spuId ${spuId}`
    );

    // Call SmileOne API to place order
    const vendorResponse = await smileOneAdapter.placeOrder(
      spuDetails.product,
      spuId,
      playerDetails.userid,
      playerDetails.zoneid
    );
    let status, subStatus;
    if (vendorResponse.status == 200) {
      logger.info(
        `Vendor order placed successfully for transaction ${transactionId}`
      );
      status = PURCHASE_STATUS.SUCCESS;
      subStatus = PURCHASE_SUBSTATUS.ORDER_PLACED;
    } else {
      logger.info(
        `Vendor order failed for transaction ${transactionId}`
      );
      status = PURCHASE_STATUS.FAILED;
      subStatus = PURCHASE_SUBSTATUS.VENDOR_FAILED;
    }
    await updateTransactionStatus(transactionId, status, subStatus, { vendorResponse });
    socket.emit('transaction-update', { transactionId, status, subStatus, stage: 4 }, `transaction:${transactionId}`);


    return {
      success: true,
      transactionId,
      orderPlaced: true,
      vendorResponse,
    };
  } catch (error) {
    logger.error(
      `Error creating vendor order for transaction ${transactionId}: ${error.message}`
    );
    await updateTransactionStatus(
      transactionId,
      PURCHASE_STATUS.FAILED,
      PURCHASE_SUBSTATUS.VENDOR_FAILED,
      {
        error: error.message,
      }
    );
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
    if ([PURCHASE_STATUS.PENDING, PURCHASE_STATUS.FAILED].includes(transaction.status)) {
      switch (transaction.subStatus) {
        case PURCHASE_SUBSTATUS.ORDER_INITIATED:
          stage = 1;
          break;
        case PURCHASE_SUBSTATUS.GATEWAY_INITIATED:
        case PURCHASE_SUBSTATUS.PAYMENT_INITIATED:
        case PURCHASE_SUBSTATUS.GATEWAY_FAILED:
        case PURCHASE_SUBSTATUS.PAYMENT_FAILED:
          stage = 2;
          break;
        case PURCHASE_SUBSTATUS.PAYMENT_SUCCESS:
        case PURCHASE_SUBSTATUS.ORDER_PLACED:
        case PURCHASE_SUBSTATUS.VENDOR_QUEUED:
        case PURCHASE_SUBSTATUS.VENDOR_FAILED:
          stage = 3;
          break;
      }
    } else if (transaction.status === PURCHASE_STATUS.SUCCESS) {
      stage = 4;
    }

    return {
      isFailed: transaction.status === PURCHASE_STATUS.FAILED,
      transactionId,
      status: transaction.status,
      subStatus: transaction.subStatus,
      stage,
      price_inr: transaction.spuDetails.price_inr,
      spuId: transaction.spuId,
      spuType: transaction.spuType,
      spuDetails: transaction.spuDetails,
      userDetails: transaction.userDetails,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      lastUpdated: transaction.updatedAt || transaction.createdAt,
    };
  } catch (error) {
    logger.error(`Failed to get transaction status: ${error.message}`);
    throw error;
  }
}

async function updateTransactionWithStage(
  transactionId,
  status,
  subStatus,
  stage,
  otherFields = {}
) {
  try {
    await db.updateOne(
      "transactions",
      { transactionId },
      {
        $set: {
          status,
          subStatus,
          updatedAt: new Date(),
          ...otherFields,
        },
      }
    );

    // Emit socket event for real-time updates
    const socket = require("../providers/socket");
    if (socket.initialized) {
      socket.emitTransactionUpdate(transactionId, {
        status,
        subStatus,
        stage,
        ...otherFields,
      });
    }

    logger.info(`Transaction update`, {
      transactionId,
      stage,
      status,
      subStatus,
      ...otherFields,
    });
  } catch (error) {
    logger.error(`Failed to update transaction: ${error.message}`);
    throw error;
  }
}

module.exports = {
  purchaseSPU,
  // Deprecated: Use processMatrixSolsWebhook instead
  processPhonePeWebhook,
  processMatrixSolsWebhook,
  processGameItemPurchase,
  getTransactionStatus,
  updateTransactionWithStage,
};
