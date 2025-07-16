const paymentService = require("../services/paymentService");
const logger = require("../utils/logger");

const purchaseSPU = async (req, res, next) => {
  try {
    const spuId = req.params.spuId;
    const { spuDetails, spuType, userDetails, playerDetails } = req.body;
    const result = await paymentService.purchaseSPU(
      spuId,
      spuDetails,
      spuType,
      userDetails,
      playerDetails
    );

    res.success(201, "SPU purchase initiated", result);
  } catch (error) {
    next(error);
  }
};

const processPhonePeWebhook = async (req, res, next) => {
  try {
    logger.info(req.body, "Processing PhonePe webhook");
    res.success(201, "Webhook processed successfully");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  purchaseSPU,
  processPhonePeWebhook,
};
