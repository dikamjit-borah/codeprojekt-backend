const config = require("config");
const axios = require("axios");
const md5 = require("crypto-js/md5");
const { get } = require("lodash");
const logger = require("../utils/logger");
const createHttpError = require("http-errors");
const cache = require("../utils/internalCache");
const smileoneConfig = config.get("smileone");

class SmileoneAdapter {
  constructor() {
    this.baseURL = smileoneConfig.baseURL;
    this.secretKey = smileoneConfig.secretKey;
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

  async call(endpoint, body = {}, method = "POST") {
    const payload = {
      uid: smileoneConfig.uid,
      email: smileoneConfig.email,
      time: Math.floor(Date.now() / 1000),
      ...body,
    };
    const signedPayload = {
      ...payload,
      sign: this.generateSignature(payload),
    };

    try {
      const response = await axios({
        method,
        url: `${this.baseURL}${endpoint}`,
        data: new URLSearchParams(signedPayload),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      return response.data;
    } catch (error) {
      logger.error(
        {
          payload: signedPayload,
          error: error.message,
        },
        "Error calling Smileone API"
      );
      throw createHttpError(
        500,
        `Error calling Smileone API: ${error.message}`
      );
    }
  }

  // === Vendor-specific endpoints ===

  async fetchSmilecoinBalance() {
    const response = await this.call("/querypoints");
    return get(response, "smile_points", 0);
  }

  async fetchProductSPUs(product) {
    const cacheKey = `productSPUs:${product}`;

    const cached = cache.getKey(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.call("/productlist", { product });
    const spuList = get(response, "data.product", []);
    cache.setKey(cacheKey, spuList, 3600000); // Cache for 1 hour
    return spuList;
  }

  async placeOrder(product, productid, userid, zoneid) {
    const payload = {
      product,
      productid,
      userid,
      zoneid,
    };
    const response = await this.call("/createorder", payload);
    return response;
  }
}

const smileoneAdapter = new SmileoneAdapter();
module.exports = smileoneAdapter;
