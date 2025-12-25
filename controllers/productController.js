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

const getMerch = async (req, res, next) => {
  try {
    const result = await productService.getMerch();
    res.success(200, "Merch fetched successfully", result);
  } catch (error) {
    next(error);
  }
};

const getSmileCoins = async (req, res, next) => {
  try {
    const result = await productService.getSmileCoins();
    res.success(200, "Smile coins fetched successfully", result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSPUsForProduct,
  getMerch,
  getSmileCoins,
};
