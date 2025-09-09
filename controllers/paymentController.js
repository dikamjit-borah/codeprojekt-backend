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

const processPhonePeWebhook = async (req, res, next) => {
  try {
    await paymentService.processPhonePeWebhook(req.headers, req.body);
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

// Demo endpoint to simulate stage updates (for development/testing)
const updateTransactionStage = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { stage } = req.body;

    if (!transactionId || !stage) {
      return res.status(400).json({
        status: 400,
        message: "Transaction ID and stage are required"
      });
    }

    // Map stage to status and substatus for demo purposes
    let status, subStatus;
    switch (parseInt(stage)) {
      case 1:
        status = "pending";
        subStatus = "order_initiated";
        break;
      case 2:
        status = "pending";
        subStatus = "gateway_initiated";
        break;
      case 3:
        status = "pending";
        subStatus = "payment_success";
        break;
      case 4:
        status = "success";
        subStatus = "order_placed";
        break;
      default:
        return res.status(400).json({
          status: 400,
          message: "Invalid stage. Must be 1, 2, 3, or 4"
        });
    }

    await paymentService.updateTransactionWithStage(transactionId, status, subStatus, parseInt(stage));
    res.success(200, `Transaction stage updated to ${stage}`, { stage: parseInt(stage) });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  purchaseSPU,
  processPhonePeWebhook,
  getTransactionStatus,
  updateTransactionStage,
};
