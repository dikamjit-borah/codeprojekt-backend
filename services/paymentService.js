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
  redirectUrl
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
        spuDetails.price, redirectUrl
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
      redirectUrl: gatewayResponse.redirectUrl,
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
      if (!(await hasSufficientSmileCoin()))
        throw createHttpError(402, "Insufficient Smile Coin balance");

      return { playerDetails };
    }

    default:
      throw createHttpError(400, `Unsupported SPU type: ${spuType}`);
  }
}

async function hasSufficientSmileCoin() {
  try {
    const smileOneBalance = await smileOneAdapter.fetchSmilecoinBalance();
    const priceInSmileCoin = spuDetails.price * brazilianRealToSmileCoin;

    if (priceInSmileCoin > smileOneBalance) {
      return false; // Insufficient balance
    }
    return true;
  } catch (error) {
    logger.error(`Failed to fetch Smile Coin balance: ${error.message}`);
    return false; // Assume insufficient balance on error
  }
}
async function initiateGatewayPayment(merchantOrderId, amount, redirectUrl) {
  const response = await phonePeAdapter.pay({
    merchantOrderId,
    amount,
    redirectUrl,
  });
  return response;
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

const processPhonePeWebhook = async (headers, body) => {
  const transaction = await this.fetchTransactionForOrderId();
  const spuType = transaction.spuType;
  switch (spuType) {
    case SPU_TYPES.MERCH:
      await paymentService.processMerchPurchase(body, transaction);
      break;
    case SPU_TYPES.IGT:
      await paymentService.processInGameItemPurchase(
        headers,
        body,
        transaction
      );
      break;
  }
};

async function fetchTransactionForOrderId(orderId) {
  const transaction = await db.findOne("transactions", { orderId });
  if (!transaction) {
    throw createHttpError(404, "Transaction not found");
  }
  return transaction;
}

async function processMerchPurchase(webhookData, transaction) {
  // Process merchandise purchase logic here
}

async function processInGameItemPurchase(headers, body, transaction) {
  const callbackResponse = await phonePeAdapter.validateCallback(
    headers.authorization,
    body
  );

  const orderId = callbackResponse.payload.orderId;
  const state = callbackResponse.payload.state;

  if (await hasSufficientSmileCoin()) {
    // Process in-game item purchase logic here
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
