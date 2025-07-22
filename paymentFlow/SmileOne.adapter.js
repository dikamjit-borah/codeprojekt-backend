const config = require("config");
const axios = require("axios");
const md5 = require("crypto-js/md5");
const { get } = require("lodash");
const logger = require("../utils/logger");
const createHttpError = require("http-errors");
const cache = require("../utils/internalCache");
const BaseVendorAdapter = require("./base.adapter");
const {
  PRODUCT_LIST,
  QUERY_POINTS,
  CREATE_ORDER,
  CHECK_ROLE,
  CHECK_ORDER,
} = require("../config/smileOne.config");

class SmileOneAdapter extends BaseVendorAdapter {
  constructor() {
    const smileOneConfig = config.get("smileOne");
    super(smileOneConfig);
    this.baseURL = smileOneConfig.baseURL;
    this.secretKey = smileOneConfig.secretKey;
    this.vendorName = "smileone";
  }

  generateSignature(payload) {
    const sortedKeys = Object.keys(payload).sort();
    let str = "";
    for (const key of sortedKeys) {
      str += `${key}=${payload[key]}&`;
    }
    str += this.secretKey;

    return md5(md5(str).toString()).toString();
  }

  async call(options, body = {}) {
    const payload = {
      uid: this.config.uid,
      email: this.config.email,
      time: Math.floor(Date.now() / 1000),
      ...body,
    };
    const signedPayload = {
      ...payload,
      sign: this.generateSignature(payload),
    };

    try {
      const axiosConfig = {
        ...options,
        url: `${this.baseURL}${options.url}`,
        data: new URLSearchParams(signedPayload),
      };
      
      this.logApiRequest(options.url, signedPayload);
      
      const response = await axios(axiosConfig);
      const responseData = response.data;
      
      this.logApiResponse(options.url, responseData);
      
      return responseData;
    } catch (error) {
      this.logApiError(options.url, error, { payload: body });
      
      throw createHttpError(
        502,
        `Error calling SmileOne API: ${error.message}`
      );
    }
  }

  // === Implementation of base interface methods ===

  /**
   * Check available SmileCoin balance
   * @returns {Promise<number>} Available balance
   */
  async checkBalance() {
    const response = await this.call(QUERY_POINTS);
    return get(response, "smile_points", 0);
  }

  /**
   * Purchase coins for a player
   * @param {Object} options Purchase options
   * @returns {Promise<Object>} Purchase result
   */
  async purchaseCoins(options) {
    const { playerId, amount, transactionId, metadata = {}, retryCount = 0 } = options;
    
    // Extract required fields for SmileOne
    const { product, productId, zoneId } = metadata;
    
    if (!product || !productId || !zoneId) {
      throw createHttpError(400, "Missing required SmileOne metadata: product, productId, zoneId");
    }
    
    try {
      // Check if this order was already processed
      try {
        const existingOrder = await this.checkTransactionStatus(transactionId);
        if (existingOrder.exists && existingOrder.success) {
          logger.info(`Order ${transactionId} already exists and was successful`);
          return {
            success: true,
            vendorTransactionId: existingOrder.order_id,
            coinsDelivered: amount,
            transactionId: transactionId,
            playerId: playerId,
            timestamp: new Date().toISOString(),
            alreadyProcessed: true
          };
        }
      } catch (checkError) {
        // If we can't check, just proceed with order placement
        logger.warn(`Could not check existing order status: ${checkError.message}`);
      }
      
      const payload = {
        product,
        productid: productId,
        userid: playerId,
        zoneid: zoneId,
        cp_orderid: transactionId, // Use our transaction ID as customer order ID
      };
      
      // Call SmileOne API to place order
      logger.info(`Placing order for transaction ${transactionId}, attempt #${retryCount + 1}`);
      const response = await this.call(CREATE_ORDER, payload);
      
      if (response.status !== 200 || response.message !== "success") {
        throw createHttpError(502, `SmileOne order failed: ${response.message}`);
      }
      
      return {
        success: true,
        vendorTransactionId: response.order_id,
        coinsDelivered: amount,
        transactionId: transactionId,
        playerId: playerId,
        timestamp: new Date().toISOString(),
        rawResponse: response
      };
    } catch (error) {
      // Log detailed error
      this.logApiError(CREATE_ORDER.url, error, { 
        transactionId, 
        retryCount,
        playerId
      });
      
      // Return standardized failure response
      return this.createFailureResponse(error, {
        transactionId,
        retryCount,
        payload: { product, productId, playerId, zoneId }
      });
    }
  }

  /**
   * Check if a transaction already exists with SmileOne
   * @param {string} transactionId Transaction ID to check
   * @returns {Promise<Object>} Transaction status
   */
  async checkTransactionStatus(transactionId) {
    try {
      // SmileOne uses cp_orderid field to track our transaction ID
      const response = await this.call(CHECK_ORDER, { cp_orderid: transactionId });
      
      if (!response || !response.data) {
        return { success: false, exists: false };
      }
      
      const order = response.data;
      
      return {
        success: order.status === "success",
        exists: true,
        coinsDelivered: parseInt(order.product_price || 0, 10),
        order_id: order.order_id,
        timestamp: order.created_at,
        status: order.status
      };
    } catch (error) {
      this.logApiError(CHECK_ORDER.url, error, { transactionId });
      throw createHttpError(502, `Failed to check order status: ${error.message}`);
    }
  }

  /**
   * Verify player identity with SmileOne
   * @param {Object} playerDetails Player identification details
   * @returns {Promise<Object>} Verification result
   */
  async verifyPlayer(playerDetails) {
    const { playerId, zoneId } = playerDetails;
    
    if (!playerId || !zoneId) {
      throw createHttpError(400, "Missing required player details: playerId, zoneId");
    }
    
    try {
      const response = await axios({
        ...CHECK_ROLE,
        url: `${this.baseURL}${CHECK_ROLE.url}`,
        data: new URLSearchParams({
          user_id: playerId,
          zone_id: zoneId,
        }),
      });
      
      const data = response.data;
      
      if (data.status !== 200 || !data.username) {
        return { 
          success: false,
          message: data.message || "Player verification failed"
        };
      }
      
      return {
        success: true,
        playerName: data.username,
        playerId: playerId,
        verified: true
      };
    } catch (error) {
      this.logApiError(CHECK_ROLE.url, error, { playerDetails });
      throw createHttpError(502, `Failed to verify player: ${error.message}`);
    }
  }

  /**
   * Get available products from SmileOne
   * @param {string} gameId Game identifier
   * @returns {Promise<Array>} Available products
   */
  async getAvailableProducts(gameId) {
    const cacheKey = `productSPUs:${gameId}`;

    const cached = cache.getKey(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.call(PRODUCT_LIST, { product: gameId });
    const spuList = get(response, "data.product", []);
    cache.setKey(cacheKey, spuList, 3600000); // Cache for 1 hour
    
    return spuList;
  }

  // Legacy methods maintained for backward compatibility
  
  async fetchSmilecoinBalance() {
    return this.checkBalance();
  }

  async fetchPlayerIGN(user_id, zone_id) {
    return this.verifyPlayer({ playerId: user_id, zoneId: zone_id });
  }

  async fetchProductSPUs(product) {
    return this.getAvailableProducts(product);
  }

  async placeOrder(product, productid, userid, zoneid, options = {}) {
    // Support both legacy and new formats
    if (typeof product === 'object') {
      // New format where first param is options object
      return this.purchaseCoins(product);
    }
    
    // Legacy format
    return this.purchaseCoins({
      playerId: userid,
      amount: 0, // Amount will be determined by product
      transactionId: options.transactionId || `order-${Date.now()}`,
      retryCount: options.retryCount || 0,
      metadata: {
        product,
        productId: productid,
        zoneId: zoneid
      }
    });
  }
}

// Export a singleton instance
const smileOneAdapter = new SmileOneAdapter();
module.exports = smileOneAdapter;