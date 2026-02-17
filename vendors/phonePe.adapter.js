const config = require("config");
const { randomUUID } = require("crypto");
const {
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
  Env,
  RefundRequest,
} = require("pg-sdk-node");
const PaymentVendor = require("./PaymentVendor");
const env = config.get("env");
const phonePeConfig = config.get("phonePe");

class PhonePeAdapter extends PaymentVendor {
  constructor() {
    super("phonePe");
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
    
    const response = await this.client.pay(payRequest);
    
    // Normalize response to match base class interface
    return {
      order_id: merchantOrderId || randomUUID(),
      payment_url: response.redirectUrl || response.url,
      ...response
    };
  }

  async validateCallback(headers, body) {
    const authorizationHeaderData = headers.authorization || headers.Authorization;
    const phonepeS2SCallbackResponseBodyString = JSON.stringify(body);
    const callbackResponse = this.client.validateCallback(
      phonePeConfig.merchantUsername,
      phonePeConfig.merchantPassword,
      authorizationHeaderData,
      phonepeS2SCallbackResponseBodyString
    );
    return callbackResponse;
  }

  async handleWebhookNotification(body) {
    // PhonePe webhook payload structure
    return {
      success: true,
      orderId: body.payload?.merchantOrderId,
      amount: body.payload?.amount,
      status: body.type === "ORDER_COMPLETED" ? "Success" : "Failed",
      transactionId: body.payload?.transactionId,
      rawPayload: body
    };
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
