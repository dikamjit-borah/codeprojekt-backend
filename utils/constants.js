// Payment Status Constants

const PURCHASE_STATUS = {
  PENDING: "pending",
  FAILED: "failed",
  SUCCESS: "success",
  CANCELLED: "cancelled",
};

const PURCHASE_SUBSTATUS = {
  ORDER_INITIATED: "order_initiated", // Initial state when order is placed.
  GATEWAY_INITIATED: "gateway_initiated", // After initiating the gateway request, before redirecting to frontend.
  PAYMENT_IN_PROGRESS: "payment_in_progress", // Redirect URL sent to client; waiting for payment to be done.
  PAYMENT_PENDING: "payment_pending", // Payment is in gateway “pending” state (e.g. UPI, delayed confirmation).
  GATEWAY_FAILED: "gateway_failed", // Gateway init failed or invalid response.
  PAYMENT_FAILED: "payment_failed", // Payment failed on client side.
  PAYMENT_SUCCESS: "payment_success", // Payment was successful and verified.
  USER_CANCELLED: "user_cancelled", // User backed out / abandoned checkout.
  ORDER_PLACED: "order_placed", // Order placed successfully after payment.
};

// Transition Example (for documentation/reference)
const PAYMENT_TRANSITIONS = [
  {
    action: "Place Order API called",
    status: PURCHASE_STATUS.PENDING,
    substatus: PURCHASE_SUBSTATUS.GATEWAY_INITIATED,
  },
  {
    action: "Redirect URL returned",
    status: PURCHASE_STATUS.PENDING,
    substatus: PURCHASE_SUBSTATUS.PAYMENT_IN_PROGRESS,
  },
  {
    action: "Client pays via gateway (success)",
    status: PURCHASE_STATUS.SUCCESS,
    substatus: PURCHASE_SUBSTATUS.PAYMENT_SUCCESS,
  },
  {
    action: "Client pays via gateway (fail)",
    status: PURCHASE_STATUS.FAILED,
    substatus: PURCHASE_SUBSTATUS.PAYMENT_FAILED,
  },
  {
    action: "Payment pending (e.g. UPI collect)",
    status: PURCHASE_STATUS.PENDING,
    substatus: PURCHASE_SUBSTATUS.PAYMENT_PENDING,
  },
];

const SPU_TYPES = {
  MERCH: "merchandise",
  IGT: "inGameItem",
};

// Export all constants
module.exports = {
  PURCHASE_STATUS,
  PURCHASE_SUBSTATUS,
  SPU_TYPES,
};
