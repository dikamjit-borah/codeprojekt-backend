const config = require("config");
const axios = require("axios");
const md5 = require("crypto-js/md5");
const { get } = require("lodash");
const logger = require("../utils/logger");
const createHttpError = require("http-errors");
const cache = require("../utils/internalCache");
const {
  PRODUCT_LIST,
  QUERY_POINTS,
  CREATE_ORDER,
  CHECK_ROLE,
} = require("../config/smileOne.config");
const smileOneConfig = config.get("smileOne");

class SmileOneAdapter {
  constructor() {
    this.baseURL = smileOneConfig.baseURL;
    this.secretKey = smileOneConfig.secretKey;
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
      uid: smileOneConfig.uid,
      email: smileOneConfig.email,
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
      logger.info({ axiosConfig }, "Calling SmileOne API");
      const response = await axios(axiosConfig);
      return response.data;
    } catch (error) {
      logger.error(
        {
          payload: signedPayload,
          error: error.message,
        },
        "Error calling SmileOne API"
      );
      throw createHttpError(
        502,
        `Error calling SmileOne API: ${error.message}`
      );
    }
  }

  // === Vendor-specific endpoints ===

  async fetchSmilecoinBalance() {
    const response = await this.call(QUERY_POINTS);
    return get(response, "smile_points", 0);
  }

  async fetchPlayerIGN(user_id, zone_id) {
    const response = await axios({
      ...CHECK_ROLE,
      url: `${this.baseURL}${CHECK_ROLE.url}`,
      data: new URLSearchParams({
        user_id,
        zone_id,
      }),
    });
    return response.data;
  }

  async fetchProductSPUs(product) {
    const cacheKey = `productSPUs:${product}`;

    const cached = cache.getKey(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.call(PRODUCT_LIST, { product });
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
    //Uncomment the following lines to enable actual order placement
    // const response = await this.call(CREATE_ORDER, payload);
    // return response;
    return {
      status: 200,
      message: "success",
      order_id: "S250528064515377SAQO",
      price: "76.0",
      info: null,
    };
  }
}

const smileOneAdapter = new SmileOneAdapter();
module.exports = smileOneAdapter;
