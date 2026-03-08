const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

router.get("/merch", productController.getMerch);
router.post("/:product/spus", productController.fetchSPUsFromVendor);
router.get("/:product/spus", productController.getCategorizedSPUsForProduct);
router.get("/smileCoins", productController.getSmileCoins);

module.exports = router;
