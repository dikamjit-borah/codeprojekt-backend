const config = require("config");
const { randomUUID } = require("crypto");
const {
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
  Env,
  RefundRequest,
} = require("pg-sdk-node");
const env = config.get("env");
const phonePeConfig = config.get("phonePe");

class PhonePeAdapter {
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
    const payRequest = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId || randomUUID())
      .amount(amount)
      .redirectUrl(redirectUrl || phonePeConfig.redirectUrl)
      .build();
    return await this.client.pay(payRequest);
  }

  async validateCallback(authorizationHeaderData, callbackResponseBody) {
    const phonepeS2SCallbackResponseBodyString = JSON.stringify(callbackResponseBody);
    const callbackResponse = this.client.validateCallback(
      phonePeConfig.merchantUsername,
      phonePeConfig.merchantPassword,
      authorizationHeaderData,
      phonepeS2SCallbackResponseBodyString
    );
    return callbackResponse;
  }

  async getOrderStatus(merchantOrderId) {
    return this.client.getOrderStatus(merchantOrderId)
  }

  async refund({
    amount,
    refundId,
    originalMerchantOrderId,
  }) {
    const refundRequest = RefundRequest.builder()
      .amount(amount)
      .merchantRefundId(refundId)
      .originalMerchantOrderId(originalMerchantOrderId)
      .build();
    return await this.client.refund(refundRequest);
  }
}

const phonePeAdapter = new PhonePeAdapter();
module.exports = phonePeAdapter;
