const productService = require("../services/productService");

const getSPUsForProduct = async (req, res, next) => {
  try {
    const product = req.params.product;
    const result = await productService.getSPUsForProduct(product);

    res.success(200, "SPUs fetched successfully", result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSPUsForProduct,
};
