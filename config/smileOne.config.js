module.exports = {
  CHECK_ROLE: {
    url: "/merchant/mobilelegends/checkrole",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  },
  QUERY_POINTS: {
    url: "/smilecoin/api/querypoints",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  },
  PRODUCT_LIST: {
    url: "/smilecoin/api/productlist",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  },
  CREATE_ORDER: {
    url: "/smilecoin/api/createorder",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  },
};
