const config = require("config");
const { evaluateRules } = require("../utils/ruleEngine");
const smileoneAdapter = require("../vendors/smileone.adapter");
const brazilianRealToSmileCoin = config.get("brazilianRealToSmilecoin");

const purchaseSPU = async (spuId, spuDetails, userDetails) => {
  try {
    const smileoneBalance = await smileoneAdapter.fetchSmilecoinBalance();
    if (spuDetails.price * brazilianRealToSmileCoin > smileoneBalance) {
      throw new Error("Insufficient Smile Coin balance");
    }
    const placeOrder = await smileoneAdapter.placeOrder(
      spuId,
      userDetails.userid,
      userDetails.zoneid
    );
  } catch (error) {
    throw new Error(`Error purchasing SPU: ${error.message}`);
  }
};

module.exports = {
  purchaseSPU,
};
