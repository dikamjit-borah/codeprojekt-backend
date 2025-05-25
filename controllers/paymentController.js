const paymentService = require("../services/paymentService");

const purchaseSPU = async (req, res) => {
  try {
    const spuId = req.params.spuId;
    const { spuDetails, userDetails } = req.body;
    const result = await paymentService.purchaseSPU(
      spuId,
      spuDetails,
      userDetails
    );

    res.json({
      status: 200,
      data: result,
    });
  } catch (error) {
    console.error("Error in getpaymentList controller:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch payment list",
    });
  }
};

module.exports = {
  purchaseSPU,
};
