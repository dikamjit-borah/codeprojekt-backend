const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

router.get("/merch", productController.getMerch);
router.get("/:product/spus", productController.getSPUsForProduct);
router.get("/smileCoins", productController.getSmileCoins);

module.exports = router;
