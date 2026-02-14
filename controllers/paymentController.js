const paymentService = require("../services/paymentService");
const logger = require("../utils/logger");

const purchaseSPU = async (req, res, next) => {
  try {
    const spuId = req.params.spuId;
    const { spuDetails, spuType, userDetails, playerDetails, redirectUrl } = req.body;
    const result = await paymentService.purchaseSPU(
      spuId,
      //spuDetails,
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

const processPhonePeWebhook = async (req, res, next) => {
  try {
    await paymentService.processPhonePeWebhook(req.headers, req.body);
    res.success(200, "Webhook processed successfully");
  } catch (error) {
    next(error);
  }
};

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

const checkMatrixSolsOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        status: 400,
        message: "Order ID is required"
      });
    }

    const orderStatus = await paymentService.checkMatrixSolsOrderStatus(orderId);
    res.success(200, "Order status retrieved successfully", orderStatus);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  purchaseSPU,
  processPhonePeWebhook,
  processMatrixSolsWebhook,
  getTransactionStatus,
  checkMatrixSolsOrderStatus,
};
