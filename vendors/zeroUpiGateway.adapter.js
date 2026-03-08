const config = require("config");
const PaymentVendor = require("../vendors/paymentVendor.abstract");
const logger = require("../utils/logger");
const { CREATE_ORDER, CHECK_ORDER_STATUS, ORDER_STATUS } = require("../config/zeroUpiGateway.config");

class ZeroUpiGatewayAdapter extends PaymentVendor {
  constructor() {
    super("zeroupi-gateway");
    
    const zeroUpiConfig = config.get("zeroUpiGateway");
    this.apiKey = zeroUpiConfig.apiKey;
    this.baseURL = zeroUpiConfig.baseURL;
  }

  /**
   * Initiate a payment transaction with ZeroUPI Gateway
   * @param {Object} params - Payment parameters
   * @returns {Promise<Object>} Payment response with order_id and payment_url
   */
  async pay({ amount, redirectUrl, orderId, customerName, customerEmail, customerMobile }) {
    try {
      logger.info("Initiating ZeroUPI Gateway payment", { amount, orderId });

      const payload = {
        orderId,
        amount,
        customerName: customerName || "Customer",
        customerEmail: customerEmail || "customer@example.com",
        customerMobile: customerMobile || "9999999999",
        paymentGateway: "multigateway", // Default gateway, can be made configurable
        redirectUrl
      };

      const response = await fetch(`${this.baseURL}${CREATE_ORDER.url}`, {
        method: CREATE_ORDER.method,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const responseJson = await response.json();

      if (!response.ok || !responseJson.success) {
        throw new Error(responseJson.message || `API Error: ${response.status}`);
      }

      logger.info("ZeroUPI Gateway payment initiated successfully", {
        orderId: responseJson.data.orderId
      });

      // Return normalized response
      return {
        order_id: responseJson.data.orderId,
        payment_url: responseJson.data.paymentUrl,
        status: responseJson.data.status,
        expiresAt: responseJson.data.expiresAt
      };
    } catch (error) {
      logger.error(`ZeroUPI Gateway payment initiation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate webhook callback from ZeroUPI Gateway
   * @param {Object} headers - Request headers
   * @param {Object} body - Webhook payload
   * @returns {Promise<boolean>} Whether the callback is valid
   */
  async validateCallback(headers, body) {
    try {
      // ZeroUPI Gateway uses API key validation
      const apiKey = headers['x-api-key'] || headers['X-API-Key'];
      
      if (!apiKey) {
        logger.warn("No API key found in ZeroUPI webhook headers");
        return false;
      }

      // Validate API key matches
      const isValid = apiKey === this.apiKey;
      
      if (!isValid) {
        logger.warn("Invalid API key in ZeroUPI webhook");
      }

      return isValid;
    } catch (error) {
      logger.error(`ZeroUPI webhook validation error: ${error.message}`);
      return false;
    }
  }

  /**
   * Parse and normalize webhook notification from ZeroUPI Gateway
   * @param {Object} body - Webhook payload
   * @returns {Promise<Object>} Normalized webhook data
   */
  async handleWebhookNotification(body) {
    try {
      logger.info("Processing ZeroUPI Gateway webhook", { body });

      // ZeroUPI webhook has nested structure: { eventId, eventType, timestamp, data: {...} }
      const webhookData = body.data || body;
      const eventType = body.eventType || body.event_type;

      // Map ZeroUPI status to our standard format
      const status = this.mapZeroUpiStatus(webhookData.status || eventType);

      return {
        success: true,
        orderId: webhookData.orderId || webhookData.order_id,
        amount: webhookData.amount,
        status: status,
        transactionId: webhookData.txnId || webhookData.transactionId || webhookData.transaction_id,
        utrNumber: webhookData.utr || webhookData.utrNumber || webhookData.referenceId,
        paymentMethod: webhookData.paymentMethod || webhookData.payment_method,
        customerName: webhookData.customerName || webhookData.customer_name,
        customerMobile: webhookData.customerMobile || webhookData.customer_mobile,
        dateTime: body.timestamp || webhookData.paidAt || webhookData.paid_at,
        eventId: body.eventId || body.event_id,
        eventType: eventType,
        rawPayload: body
      };
    } catch (error) {
      logger.error(`ZeroUPI webhook parsing error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get order status from ZeroUPI Gateway
   * @param {string} orderId - Order ID to check
   * @returns {Promise<Object>} Order status response
   */
  async getOrderStatus(orderId) {
    try {
      logger.info("Checking ZeroUPI Gateway order status", { orderId });

      const response = await fetch(`${this.baseURL}${CHECK_ORDER_STATUS.url}`, {
        method: CHECK_ORDER_STATUS.method,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ orderId })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || `API Error: ${response.status}`);
      }

      const status = this.mapZeroUpiStatus(data.data.status);

      return {
        success: true,
        orderId: data.data.orderId,
        status: status,
        amount: data.data.amount,
        transactionId: data.data.transactionId,
        paymentMethod: data.data.paymentMethod,
        paidAt: data.data.paidAt,
        rawResponse: data
      };
    } catch (error) {
      logger.error(`ZeroUPI order status check failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        orderId: orderId
      };
    }
  }

  /**
   * Map ZeroUPI Gateway status to standardized status
   * @param {string} zeroUpiStatus - Status from ZeroUPI Gateway or eventType
   * @returns {string} "Success" or "Failed"
   */
  mapZeroUpiStatus(zeroUpiStatus) {
    if (!zeroUpiStatus) {
      return "Failed";
    }

    const statusString = zeroUpiStatus.toUpperCase();

    // Handle event types (e.g., "payment.success", "payment.failed")
    if (statusString.includes('SUCCESS') || statusString.includes('COMPLETED') || statusString.includes('PAID')) {
      return 'Success';
    }

    if (statusString.includes('FAIL') || statusString.includes('CANCEL') || statusString.includes('EXPIRE')) {
      return 'Failed';
    }

    // Handle direct status values
    const statusMap = {
      [ORDER_STATUS.SUCCESS]: 'Success',
      [ORDER_STATUS.COMPLETED]: 'Success',
      [ORDER_STATUS.PAID]: 'Success',
      [ORDER_STATUS.FAILED]: 'Failed',
      [ORDER_STATUS.CANCELLED]: 'Failed',
      [ORDER_STATUS.EXPIRED]: 'Failed',
      [ORDER_STATUS.PENDING]: 'Failed', // Treat pending as failed for webhook processing
      [ORDER_STATUS.INITIATED]: 'Failed'
    };

    return statusMap[statusString] || 'Failed';
  }
}

// Export singleton instance
const zeroUpiGatewayAdapter = new ZeroUpiGatewayAdapter();
module.exports = zeroUpiGatewayAdapter;
