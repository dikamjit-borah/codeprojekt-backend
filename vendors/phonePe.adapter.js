const config = require("config");
const { randomUUID } = require("crypto");
const {
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
  Env,
} = require("pg-sdk-node");
const env = config.get("ENV");
const phonePeConfig = config.get("phonePe");

class PhonePeClient {
  constructor() {
    this.client = StandardCheckoutClient.getInstance(
      phonePeConfig.clientId,
      phonePeConfig.clientSecret,
      Number(phonePeConfig.clientVersion),
      env === ("prod" || "production") ? Env.PRODUCTION : Env.SANDBOX
    );
  }

  async pay({
    merchantOrderId,
    amount,
    metaInfo,
    message,
    redirectUrl,
    expireAfter,
  }) {
    const reqPay = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId || randomUUID())
      .amount(amount)
      .redirectUrl(redirectUrl || this.phonePeConfig.redirectUrl)
      .build();
    return await this.client.pay(reqPay);
  }

  // async getStatus(orderId) { ... }
  // async refund(params) { ... }
}

module.exports = PhonePeClient;
