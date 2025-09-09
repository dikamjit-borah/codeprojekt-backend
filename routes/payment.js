const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { validateRequest } = require("../middlewares/requestHandler");
const { purchaseSPU } = require("../providers/joi.schemas");

// Purchase endpoints
router.post(
    "/purchase/:spuId",
    validateRequest(purchaseSPU),
    paymentController.purchaseSPU
);

// Webhook endpoints
router.post("/phonePe/webhook", paymentController.processPhonePeWebhook);

// Transaction status endpoints
router.get("/transaction/:transactionId/status", paymentController.getTransactionStatus);

// Demo/Testing endpoints (should be removed in production)
router.put("/transaction/:transactionId/stage", paymentController.updateTransactionStage);

module.exports = router;
