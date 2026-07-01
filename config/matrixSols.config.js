module.exports = {
  // v1
  CREATE_ORDER: {
    url: "/api/payment-gateway/create_upi_order",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  },
  CHECK_ORDER_STATUS: {
    url: "/api/payment-gateway/check_upi_order_status",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  },
  // v2
  V2_CREATE_ORDER: {
    url: "/api/v2/payment_gateway/create_upi_order",
    method: "POST",
  },
  V2_CHECK_ORDER_STATUS: {
    url: "/api/v2/payment_gateway/check_upi_order_status",
    method: "POST",
  },
};
