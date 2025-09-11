// Payment Status Constants

const PURCHASE_STATUS = {
  PENDING: "pending",
  PAYMENT_COMPLETED: "payment_completed",
  FAILED: "failed",
  SUCCESS: "success",
  CANCELLED: "cancelled",
};

const PURCHASE_SUBSTATUS = {
  ORDER_INITIATED: "order_initiated", // Initial state when order is placed.
  ORDER_PLACED: "order_placed", // Order placed successfully after payment.

  GATEWAY_INITIATED: "gateway_initiated", // After initiating the gateway request, before redirecting to frontend.
  GATEWAY_FAILED: "gateway_failed", // Gateway init failed or invalid response.

  PAYMENT_INITIATED: "payment_initiated", // Redirect URL sent to client; waiting for payment to be done.
  PAYMENT_PENDING: "payment_pending", // Payment is in gateway “pending” state (e.g. UPI, delayed confirmation).
  PAYMENT_FAILED: "payment_failed", // Payment failed on client side.
  PAYMENT_SUCCESS: "payment_success", // Payment was successful and verified.

  VENDOR_QUEUED: "vendor_queued", // After payment success, when queuing vendor order.
  VENDOR_FAILED: "vendor_failed", // After payment success, when calling vendor API fails.

  USER_CANCELLED: "user_cancelled", // User backed out / abandoned checkout.
};

const PHONE_PE_WEBHOOK_TYPES = {
  ORDER_COMPLETED: "CHECKOUT_ORDER_COMPLETED",	// The payment was successfully completed
  ORDER_FAILED: "CHECKOUT_ORDER_FAILED",	// The payment failed
  REFUND_COMPLETED: "PG_REFUND_COMPLETED",	// A refund was successfully processed
  REFUND_FAILED: "PG_REFUND_FAILED",	// A refund request failed
  REFUND_ACCEPTED: "PG_REFUND_ACCEPTED"	// PhonePe Payment Gateway acknowledged the refund request, but it’s not completed yet
}

const SPU_TYPES = {
  MERCH: "merchandise",
  GAME_ITEM: "inGameItem",
};

// Export all constants
module.exports = {
  PURCHASE_STATUS,
  PURCHASE_SUBSTATUS,
  SPU_TYPES,
  PHONE_PE_WEBHOOK_TYPES,
  WHITELISTED_PATHS: [
    "/health",
    "/v1/user/login/google",
    "/v1/payment/phonePe/webhook",
  ],
};
