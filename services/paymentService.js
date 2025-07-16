const config = require("config");
const db = require("../utils/mongo");
const createHttpError = require("http-errors");
const UUID = require("uuid");
const brazilianRealToSmileCoin = config.get("brazilianRealToSmilecoin");
const smileOneAdapter = require("../vendors/smileOne.adapter");
const phonePeAdapter = require("../vendors/phonePe.adapter");
const { PURCHASE_STATUS, PURCHASE_SUBSTATUS } = require("../utils/constants");

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
        spuDetails.price,
        redirectUrl
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
    case "merchandise":
      return {};

    case "inGameItem": {
      const smileOneBalance = await smileOneAdapter.fetchSmilecoinBalance();
      const priceInSmileCoin = spuDetails.price * brazilianRealToSmileCoin;

      if (priceInSmileCoin > smileOneBalance) {
        throw createHttpError(402, "Insufficient Smile Coin balance");
      }

      return { playerDetails };
    }

    default:
      throw createHttpError(400, `Unsupported SPU type: ${spuType}`);
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

module.exports = {
  purchaseSPU,
};
