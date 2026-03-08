module.exports = {
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
};
