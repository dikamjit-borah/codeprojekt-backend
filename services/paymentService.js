const config = require("config");
const db = require("../utils/mongo");
const smileoneAdapter = require("../vendors/smileone.adapter");
const createHttpError = require("http-errors");
const brazilianRealToSmileCoin = config.get("brazilianRealToSmilecoin");

const purchaseSPU = async (spuId, spuDetails, playerDetails, userDetails) => {
  const smileoneBalance = await smileoneAdapter.fetchSmilecoinBalance();
  if (spuDetails.price * brazilianRealToSmileCoin > smileoneBalance) {
    throw createHttpError(402, "Insufficient Smile Coin balance");
  }
  const orderDetails = await smileoneAdapter.placeOrder(
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
