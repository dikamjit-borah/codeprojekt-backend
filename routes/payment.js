const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

router.post("/purchase/:spuId", paymentController.purchaseSPU);
router.post("/phonePe/webhook", paymentController.processPhonePeWebhook);

module.exports = router;
