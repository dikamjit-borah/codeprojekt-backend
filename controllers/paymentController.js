const paymentService = require("../services/paymentService");

const purchaseSPU = async (req, res, next) => {
  try {
    const spuId = req.params.spuId;
    const { spuDetails, userDetails } = req.body;
    const result = await paymentService.purchaseSPU(
      spuId,
      spuDetails,
      userDetails
    );

    res.success(201, "Order placed successfully", result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  purchaseSPU,
};
