const config = require("config");
const db = require("../utils/mongo");
const smileOneAdapter = require("../vendors/smileOne.adapter");
const createHttpError = require("http-errors");
const brazilianRealToSmileCoin = config.get("brazilianRealToSmilecoin");

const purchaseSPU = async (spuId, spuDetails, playerDetails, userDetails) => {
  const smileOneBalance = await smileOneAdapter.fetchSmilecoinBalance();
  if (spuDetails.price * brazilianRealToSmileCoin > smileOneBalance) {
    throw createHttpError(402, "Insufficient Smile Coin balance");
  }
  const orderDetails = await smileOneAdapter.placeOrder(
    spuDetails.product,
    spuId,
    playerDetails.userid,
    playerDetails.zoneid
  );

  // save order details to the database
  return await db.insertOne("transactions", {
    spuId,
    spuDetails,
    playerDetails,
    userDetails,
    orderDetails,
    status: "SUCCESS",
  });
  //postPaymentWorkflow();
};

async function postPaymentWorkflow() {
  generateReceipt();
  sendEmailNotification();
}

module.exports = {
  purchaseSPU,
};
