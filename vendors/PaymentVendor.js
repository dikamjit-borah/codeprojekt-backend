/**
 * Abstract base class for payment vendor adapters
 * All payment vendors must extend this class and implement required methods
 */
class PaymentVendor {
  constructor(vendorName) {
    if (this.constructor === PaymentVendor) {
      throw new Error("PaymentVendor is an abstract class and cannot be instantiated directly");
    }
    this.vendorName = vendorName;
  }

  /**
   * Initiate a payment transaction
   * @param {Object} params - Payment parameters
   * @param {number} params.amount - Transaction amount
   * @param {string} params.redirectUrl - Redirect URL after payment
   * @param {string} [params.customerName] - Customer name (optional)
   * @param {string} [params.customerEmail] - Customer email (optional)
   * @param {string} [params.customerMobile] - Customer mobile (optional)
   * @param {string} [params.merchantOrderId] - Merchant order ID (optional)
   * @returns {Promise<Object>} Payment response with orderId and redirectUrl
   */
  async pay(params) {
    throw new Error("Method 'pay()' must be implemented by subclass");
  }

  /**
   * Validate webhook callback from payment vendor
   * @param {Object} headers - Request headers
   * @param {Object} body - Webhook payload
   * @returns {Promise<boolean>} Whether the callback is valid
   */
  async validateCallback(headers, body) {
    throw new Error("Method 'validateCallback()' must be implemented by subclass");
  }

  /**
   * Handle and parse webhook notification
   * @param {Object} body - Webhook payload
   * @returns {Promise<Object>} Parsed webhook data with orderId, status, etc.
   */
  async handleWebhookNotification(body) {
    throw new Error("Method 'handleWebhookNotification()' must be implemented by subclass");
  }

  /**
   * Get order status from payment vendor
   * @param {string} orderId - Order ID to check
   * @returns {Promise<Object>} Order status response
   */
  async getOrderStatus(orderId) {
    throw new Error("Method 'getOrderStatus()' must be implemented by subclass");
  }

  /**
   * Get the vendor name
   * @returns {string} Vendor name
   */
  getVendorName() {
    return this.vendorName;
  }
}

module.exports = PaymentVendor;
