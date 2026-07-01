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

// Captures raw body string before JSON parsing — required for v2 webhook signature validation
const rawBodyCapture = (req, res, next) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
        req.rawBody = raw;
        try { req.body = JSON.parse(raw); } catch { req.body = {}; }
        next();
    });
};

// Webhook endpoints
router.post("/phonePe/webhook", paymentController.processPhonePeWebhook);
router.post("/matrixSols/webhook", rawBodyCapture, paymentController.processMatrixSolsWebhook);


// Transaction status endpoints
router.get("/transaction/:transactionId/status", paymentController.getTransactionStatus);

module.exports = router;
