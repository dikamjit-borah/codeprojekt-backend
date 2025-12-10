const config = require("config");
const axios = require("axios");
const crypto = require("crypto");
const { get } = require("lodash");
const logger = require("../utils/logger");
const createHttpError = require("http-errors");

const moogoldConfig = config.get("moogold");

class MooGoldAdapter {
  constructor() {
    this.baseURL = moogoldConfig.baseURL;
    this.partnerId = moogoldConfig.partnerId;
    this.secretKey = moogoldConfig.secretKey;
  }

  /**
   * Generate authentication headers for MooGold API
   * 
   * Required headers:
   * 1. Authorization: Basic Auth (base64_encode(partnerId:secretKey))
   * 2. auth: HMAC-SHA256 signature
   * 3. timestamp: Current UNIX timestamp
   * 
   * @param {Object} payload - Request body payload
   * @param {string} path - API path (e.g., "order/create_order")
   * @returns {Object} - Headers object with authentication
   */
  generateAuthHeaders(payload, path) {
    try {
      // 1. Generate Basic Auth header
      const credentials = `${this.partnerId}:${this.secretKey}`;
      const basicAuth = Buffer.from(credentials).toString("base64");

      // 2. Generate timestamp
      const timestamp = Math.floor(Date.now() / 1000);

      // 3. Generate Auth Signature
      // Formula: hash_hmac('SHA256', Payload + Current Timestamp + Path, YOUR_SECRET_HERE)
      const payloadString = JSON.stringify(payload);
      const stringToSign = `${payloadString}${timestamp}${path}`;
      
      const authSignature = crypto
        .createHmac("sha256", this.secretKey)
        .update(stringToSign)
        .digest("hex");

      return {
        Authorization: `Basic ${basicAuth}`,
        auth: authSignature,
        timestamp: timestamp.toString(),
        "Content-Type": "application/json",
      };
    } catch (error) {
      logger.error({ error: error.message }, "Failed to generate MooGold auth headers");
      throw createHttpError(500, `Authentication header generation failed: ${error.message}`);
    }
  }

  /**
   * Make HTTP request to MooGold API with authentication
   * 
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} path - API path
   * @param {Object} data - Request body data
   * @returns {Promise<Object>} - API response data
   */
  async makeRequest(method, path, data = {}) {
    try {
      const headers = this.generateAuthHeaders(data, path);
      const url = `${this.baseURL}/${path}`;

      logger.info(
        { method, path, url },
        "Making MooGold API request"
      );

      const response = await axios({
        method,
        url,
        headers,
        data: method !== "GET" ? data : undefined,
      });

      logger.info(
        { path, status: response.status },
        "MooGold API request successful"
      );

      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.err_message || error.message;
      const errorCode = error.response?.data?.err_code || error.response?.status;

      logger.error(
        {
          path,
          status: error.response?.status,
          errorCode,
          errorMessage,
        },
        "MooGold API request failed"
      );

      throw createHttpError(
        error.response?.status || 502,
        `MooGold API Error (${errorCode}): ${errorMessage}`
      );
    }
  }

  // ============= ORDER ENDPOINTS =============

  /**
   * Create an order in MooGold
   * 
   * @param {Object} params - Order parameters
   * @param {number} params.category - 1 (Direct Top Up) or 2 (eVouchers)
   * @param {number} params.productId - Variation ID from product details
   * @param {number} params.quantity - Order quantity (max 10)
   * @param {string} params.userId - Player/User ID (dynamic field)
   * @param {string} params.serverId - Server ID if required (dynamic field)
   * @param {string} [params.partnerOrderId] - Optional partner order ID for duplicate prevention
   * @returns {Promise<Object>} - Created order response
   */
  async createOrder({
    category,
    productId,
    quantity,
    userId,
    serverId,
    partnerOrderId,
  }) {
    if (!category || !productId || !quantity) {
      throw createHttpError(400, "Missing required fields: category, productId, quantity");
    }

    const payload = {
      path: "order/create_order",
      data: {
        category,
        "product-id": productId,
        quantity,
        "User ID": userId,
        Server: serverId,
      },
    };

    if (partnerOrderId) {
      payload.partnerOrderId = partnerOrderId;
    }

    const response = await this.makeRequest("POST", "order/create_order", payload);

    return {
      success: response.status || response.success,
      message: response.message,
      orderId: get(response, "account_details.order_id"),
      playerId: get(response, "account_details.player_id"),
      serverId: get(response, "account_details.server_id"),
      rawResponse: response,
    };
  }

  /**
   * Get order details by order ID
   * 
   * @param {number} orderId - MooGold order ID
   * @returns {Promise<Object>} - Order details
   */
  async getOrderDetail(orderId) {
    if (!orderId) {
      throw createHttpError(400, "Order ID is required");
    }

    const payload = {
      path: "order/order_detail",
      order_id: orderId,
    };

    const response = await this.makeRequest("POST", "order/order_detail", payload);

    return {
      orderId: response.order_id,
      dateCreated: response.date_created,
      status: response.order_status,
      items: Array.isArray(response.item)
        ? response.item.map((item) => ({
            product: item.product,
            variationId: item.variation_id,
            quantity: item.quantity,
            price: item.price,
            playerId: item.player_id,
            serverId: item.server_id,
            voucherCodes: item.voucher_code,
          }))
        : [],
      total: response.total,
      rawResponse: response,
    };
  }

  /**
   * Get order details by partner order ID
   * 
   * @param {string} partnerOrderId - Partner order ID
   * @returns {Promise<Object>} - Order details
   */
  async getOrderDetailByPartnerOrderId(partnerOrderId) {
    if (!partnerOrderId) {
      throw createHttpError(400, "Partner Order ID is required");
    }

    const payload = {
      path: "order/order_detail_partner_id",
      partner_order_id: partnerOrderId,
    };

    const response = await this.makeRequest(
      "POST",
      "order/order_detail_partner_id",
      payload
    );

    return {
      orderId: response.order_id,
      dateCreated: response.date_created,
      status: response.order_status,
      items: Array.isArray(response.item)
        ? response.item.map((item) => ({
            product: item.product,
            variationId: item.variation_id,
            quantity: item.quantity,
            price: item.price,
            playerId: item.player_id,
            serverId: item.server_id,
            voucherCodes: item.voucher_code,
          }))
        : [],
      total: response.total,
      partnerOrderId: response.partner_order_id,
      rawResponse: response,
    };
  }

  /**
   * Retrieve transaction history for a date range
   * 
   * @param {Object} params - Query parameters
   * @param {string} params.startDate - Start date (YYYY-MM-DD)
   * @param {string} params.endDate - End date (YYYY-MM-DD)
   * @param {string} [params.status] - Filter by status (processing, completed, refunded)
   * @param {number} [params.page] - Page number (default: 1)
   * @param {number} [params.limit] - Results per page (default: 20, max: 100)
   * @returns {Promise<Object>} - Transaction history
   */
  async getTransactionHistory({
    startDate,
    endDate,
    status,
    page = 1,
    limit = 20,
  }) {
    if (!startDate || !endDate) {
      throw createHttpError(400, "startDate and endDate are required (YYYY-MM-DD format)");
    }

    if (limit > 100) {
      throw createHttpError(400, "Limit cannot exceed 100");
    }

    const payload = {
      path: "order/transaction_history",
      start_date: startDate,
      end_date: endDate,
      page,
      limit,
    };

    if (status) {
      payload.status = status;
    }

    const response = await this.makeRequest(
      "POST",
      "order/transaction_history",
      payload
    );

    return {
      status: response.status,
      page: response.page,
      limit: response.limit,
      orders: Array.isArray(response.orders)
        ? response.orders.map((order) => ({
            orderId: order.order_id,
            dateCreated: order.date_created,
            status: order.status,
            total: order.total,
            currency: order.currency,
            items: order.items,
          }))
        : [],
      rawResponse: response,
    };
  }

  // ============= PRODUCT ENDPOINTS =============

  /**
   * List products by category
   * 
   * Category IDs:
   * - 50: Direct Top-up Products
   * - 51: Other Gift Cards
   * - 1391: Amazon Gift Cards
   * - 1444: Apple Music
   * - 766: Garena Shells
   * - 538: Google Play
   * - 2433: iTunes Gift Card
   * - 1223: League of Legends
   * - 874: Netflix
   * - 765: PSN
   * - 451: Razer Gold
   * - 1261: Riot Access Code
   * - 3563: Roblox
   * - 992: Spotify
   * - 993: Steam
   * - 2377: Apex Legends
   * - 3154: XBox Gift Card
   * - 3737: Nintendo Gift Card
   * - 3381: NetEase Pay
   * - 3351: Astro Pay
   * - 3075: Bilibili
   * - 3382: iQIYI
   * 
   * @param {number} categoryId - MooGold category ID
   * @returns {Promise<Array>} - List of products
   */
  async listProducts(categoryId) {
    if (!categoryId) {
      throw createHttpError(400, "Category ID is required");
    }

    const payload = {
      path: "product/list_product",
      category_id: categoryId,
    };

    const response = await this.makeRequest("POST", "product/list_product", payload);

    return Array.isArray(response)
      ? response.map((product) => ({
          id: product.ID,
          name: product.post_title,
          rawResponse: product,
        }))
      : [];
  }

  /**
   * Get product details including variations and variations
   * 
   * @param {number} productId - MooGold product ID
   * @returns {Promise<Object>} - Product details with variations
   */
  async getProductDetail(productId) {
    if (!productId) {
      throw createHttpError(400, "Product ID is required");
    }

    const payload = {
      path: "product/product_detail",
      product_id: productId,
    };

    const response = await this.makeRequest(
      "POST",
      "product/product_detail",
      payload
    );

    return {
      name: response.Product_Name,
      imageUrl: response.Image_URL,
      variations: Array.isArray(response.Variation)
        ? response.Variation.map((variation) => ({
            variationName: variation.variation_name,
            variationId: variation.variation_id,
            variationPrice: variation.variation_price,
          }))
        : [],
      rawResponse: response,
    };
  }

  /**
   * Get product server list (if available)
   * 
   * @param {number} productId - MooGold product ID
   * @returns {Promise<Object>} - Server list for the product
   */
  async getServerList(productId) {
    if (!productId) {
      throw createHttpError(400, "Product ID is required");
    }

    const payload = {
      path: "product/server_list",
      product_id: productId,
    };

    const response = await this.makeRequest("POST", "product/server_list", payload);

    // Convert server list object to array format
    const servers = [];
    for (const [serverName, serverId] of Object.entries(response)) {
      servers.push({
        name: serverName,
        id: serverId,
      });
    }

    return {
      servers,
      rawResponse: response,
    };
  }

  /**
   * Validate product with user data
   * 
   * @param {Object} params - Validation parameters
   * @param {number} params.productId - Product ID to validate
   * @param {Object} params.data - Dynamic data fields (User ID, Server, etc.)
   * @returns {Promise<Object>} - Validation result
   */
  async validateProduct({ productId, data = {} }) {
    if (!productId) {
      throw createHttpError(400, "Product ID is required");
    }

    const payload = {
      path: "product/validate",
      data: {
        "product-id": productId,
        ...data,
      },
    };

    const response = await this.makeRequest("POST", "product/validate", payload);

    return {
      isValid: response.status === true || response.status === "true",
      message: response.message,
      username: response.username,
      rawResponse: response,
    };
  }

  // ============= USER ENDPOINTS =============

  /**
   * Get current wallet balance
   * 
   * @returns {Promise<Object>} - Balance information
   */
  async getBalance() {
    const payload = {
      path: "user/balance",
    };

    const response = await this.makeRequest("POST", "user/balance", payload);

    return {
      currency: response.currency,
      balance: parseFloat(response.balance),
      rawResponse: response,
    };
  }

  /**
   * Reload wallet balance using USDT-TRC20
   * 
   * @param {Object} params - Reload parameters
   * @param {string} params.amount - Amount to reload
   * @returns {Promise<Object>} - Reload details with payment address
   */
  async reloadBalance({ amount }) {
    if (!amount) {
      throw createHttpError(400, "Amount is required");
    }

    const payload = {
      path: "user/reload_balance",
      payment_method: "usdt-trc20-payment-gateway",
      amount,
    };

    const response = await this.makeRequest("POST", "user/reload_balance", payload);

    return {
      orderId: response.order_id,
      paymentAddress: response.payment_address,
      amount: response.amount,
      walletCurrency: response.wallet_currency,
      rawResponse: response,
    };
  }
}

const moogoldAdapter = new MooGoldAdapter();
module.exports = moogoldAdapter;
