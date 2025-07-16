const paymentService = require("../services/paymentService");

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
    res.success(201, "SPU purchase completed succesfully", result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  purchaseSPU,
  processPhonePeWebhook,
};
