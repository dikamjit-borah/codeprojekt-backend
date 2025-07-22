const logger = require("../utils/logger");
const createHttpError = require("http-errors");

/**
 * Base vendor adapter that defines the common interface
 * All vendor implementations must extend this class
 */
class BaseVendorAdapter {
  constructor(config) {
    this.config = config;
    this.vendorName = "base"; // Override in subclasses
  }

  /**
   * Check available balance for this vendor
   * @returns {Promise<number>} Available balance
   */
  async checkBalance() {
    throw new Error("Method not implemented: checkBalance");
  }

  /**
   * Purchase coins for a player
   * @param {Object} options Purchase options
   * @param {string} options.playerId Player identifier
   * @param {number} options.amount Amount of coins to purchase
   * @param {string} options.transactionId Unique transaction ID
   * @param {Object} options.metadata Additional vendor-specific metadata
   * @param {number} options.retryCount Current retry count
   * @returns {Promise<Object>} Purchase result
   */
  async purchaseCoins(options) {
    throw new Error("Method not implemented: purchaseCoins");
  }

  /**
   * Check if a transaction already exists with the vendor
   * @param {string} transactionId Transaction ID to check
   * @returns {Promise<Object>} Transaction status
   */
  async checkTransactionStatus(transactionId) {
    throw new Error("Method not implemented: checkTransactionStatus");
  }

  /**
   * Verify player identity/account with the vendor
   * @param {Object} playerDetails Player identification details
   * @returns {Promise<Object>} Verification result
   */
  async verifyPlayer(playerDetails) {
    throw new Error("Method not implemented: verifyPlayer");
  }

  /**
   * Get available products/denominations from this vendor
   * @param {string} gameId Game identifier
   * @returns {Promise<Array>} Available products
   */
  async getAvailableProducts(gameId) {
    throw new Error("Method not implemented: getAvailableProducts");
  }

  /**
   * Determine if an error is retryable
   * @param {Error} error The error to check
   * @returns {boolean} Whether the error is retryable
   */
  isRetryableError(error) {
    // Network related errors are usually retryable
    if (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ENETUNREACH'
    ) {
      return true;
    }
    
    // Server errors (5xx) are usually retryable
    if (error.statusCode && error.statusCode >= 500 && error.statusCode < 600) {
      return true;
    }
    
    // Certain specific error messages may be retryable
    if (error.message) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('temporarily unavailable') ||
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('try again')
      );
    }
    
    return false;
  }

  /**
   * Categorize vendor error for consistent status tracking
   * @param {Error} error The error to categorize
   * @returns {string} Error category
   */
  categorizeError(error) {
    const errorMsg = (error.message || '').toLowerCase();
    
    if (errorMsg.includes('network') || errorMsg.includes('connection')) {
      return 'VENDOR_NETWORK_ERROR';
    } else if (errorMsg.includes('timeout')) {
      return 'VENDOR_TIMEOUT';
    } else if (errorMsg.includes('balance') || errorMsg.includes('insufficient')) {
      return 'VENDOR_INSUFFICIENT_BALANCE';
    } else if (errorMsg.includes('validation') || errorMsg.includes('invalid')) {
      return 'VENDOR_VALIDATION_ERROR';
    } else if (errorMsg.includes('server')) {
      return 'VENDOR_SERVER_ERROR';
    }
    
    return 'VENDOR_UNKNOWN_ERROR';
  }

  /**
   * Create a standardized failure response
   * @param {Error} error Error that occurred
   * @param {Object} options Additional failure details
   * @returns {Object} Standardized failure response
   */
  createFailureResponse(error, options = {}) {
    const { transactionId, retryCount = 0, payload = {} } = options;
    
    const isRetryable = this.isRetryableError(error);
    const errorCategory = this.categorizeError(error);
    
    return {
      success: false,
      error: error.message,
      errorCode: error.statusCode || 502,
      errorCategory,
      failureTimestamp: new Date().toISOString(),
      transactionId,
      retryCount,
      retryable: isRetryable,
      payload
    };
  }

  /**
   * Log vendor API request for debugging
   */
  logApiRequest(endpoint, payload) {
    logger.info(
      {
        vendor: this.vendorName,
        endpoint,
        payload: this._sanitizePayload(payload)
      },
      `${this.vendorName} API Request`
    );
  }

  /**
   * Log vendor API response for debugging
   */
  logApiResponse(endpoint, response) {
    logger.debug(
      {
        vendor: this.vendorName,
        endpoint,
        response: this._sanitizeResponse(response)
      },
      `${this.vendorName} API Response`
    );
  }

  /**
   * Log vendor API error for debugging
   */
  logApiError(endpoint, error, options = {}) {
    const { transactionId, retryCount } = options;
    
    logger.error(
      {
        vendor: this.vendorName,
        endpoint,
        error: error.message,
        stack: error.stack,
        transactionId,
        retryCount,
        retryable: this.isRetryableError(error),
        errorCategory: this.categorizeError(error)
      },
      `${this.vendorName} API Error`
    );
  }

  /**
   * Sanitize payload for logging (remove sensitive data)
   * @private
   */
  _sanitizePayload(payload) {
    // Implement based on vendor payload structure
    // This is a basic implementation
    const sanitized = { ...payload };
    
    // Remove any sensitive fields
    delete sanitized.sign;
    delete sanitized.signature;
    delete sanitized.secretKey;
    delete sanitized.secret;
    delete sanitized.password;
    
    return sanitized;
  }

  /**
   * Sanitize response for logging (trim large data)
   * @private
   */
  _sanitizeResponse(response) {
    // Implement based on vendor response structure
    // This basic implementation helps avoid logging massive responses
    return response;
  }
}

module.exports = BaseVendorAdapter;