const paymentService = require("../services/paymentService");
const logger = require("../utils/logger");

const purchaseSPU = async (req, res, next) => {
  try {
    const spuId = req.params.spuId;
    const { spuDetails, spuType, userDetails, playerDetails, redirectUrl } = req.body;
    const result = await paymentService.purchaseSPU(
      spuId,
      spuDetails,
      spuType,
      userDetails,
      playerDetails,
      redirectUrl
    );

    res.success(201, "SPU purchase initiated", result);
  } catch (error) {
    next(error);
  }
};

/**
 * Generic webhook handler for any payment vendor
 */
const processPaymentWebhook = async (req, res, next) => {
  try {
    const vendorName = req.params.vendorName;
    await paymentService.processPaymentWebhook(vendorName, req.headers, req.body);
    res.success(200, "Webhook processed successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * @deprecated Use processPaymentWebhook instead
 */
const processPhonePeWebhook = async (req, res, next) => {
  try {
    await paymentService.processPhonePeWebhook(req.headers, req.body);
    res.success(200, "Webhook processed successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * @deprecated Use processPaymentWebhook instead
 */
const processMatrixSolsWebhook = async (req, res, next) => {
  try {
    await paymentService.processMatrixSolsWebhook(req.headers, req.body);
    res.success(200, "Webhook processed successfully");
  } catch (error) {
    next(error);
  }
};

const getTransactionStatus = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    
    if (!transactionId) {
      return res.status(400).json({
        status: 400,
        message: "Transaction ID is required"
      });
    }

    const transactionStatus = await paymentService.getTransactionStatus(transactionId);
    res.success(200, "Transaction status retrieved successfully", transactionStatus);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  purchaseSPU,
  processPaymentWebhook,
  // Backward compatibility
  processPhonePeWebhook,
  processMatrixSolsWebhook,
  getTransactionStatus,
};
