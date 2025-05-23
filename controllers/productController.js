const productService = require('../services/productService');

const getSPUsForProduct = async (req, res) => {
  try {
    const product = req.params.product;
    const result = await productService.getSPUsForProduct(product);
    
    res.json({
      status: 200,
      data: result
    });
  } catch (error) {
    console.error('Error in getProductList controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product list'
    });
  }
};

module.exports = {
  getSPUsForProduct
}; 