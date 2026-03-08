/**
 * ZeroUPI Gateway API Configuration
 * Base URL: https://hayat.zeroupigateway.com/api/v1
 */

module.exports = {
  // Create Payment Order
  CREATE_ORDER: {
    url: "/orders/api/create",
    method: "POST",
  },

  // Check Order Status
  CHECK_ORDER_STATUS: {
    url: "/orders/api/status",
    method: "POST",
  },

  // Payment Gateways supported by ZeroUPI
  PAYMENT_GATEWAYS: {
    PAYTM: "paytm",
    PHONEPE: "phonepe",
    GPAY: "gpay",
    UPI: "upi",
  },

  // Order Status Values
  ORDER_STATUS: {
    PENDING: "PENDING",
    SUCCESS: "SUCCESS",
    COMPLETED: "COMPLETED",
    PAID: "PAID",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    INITIATED: "INITIATED",
  },

  // Webhook Event Types
  EVENT_TYPES: {
    PAYMENT_SUCCESS: "payment.success",
    PAYMENT_FAILED: "payment.failed",
    PAYMENT_PENDING: "payment.pending",
    PAYMENT_CANCELLED: "payment.cancelled",
    PAYMENT_EXPIRED: "payment.expired",
  },
};
