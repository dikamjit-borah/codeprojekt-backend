const config = require("config");
const axios = require("axios");
const md5 = require("crypto-js/md5");
const { get } = require("lodash");
const smileoneConfig = config.get("smileone");

class SmileOneAdapter {
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
      console.error(`Vendor API call failed: ${error.message}`);
      throw error;
    }
  }

  // === Vendor-specific endpoints ===

  async getSmileCoinBalance() {
    return await this.call("/querypoints");
  }

  async fetchProductSPUs(product) {
    const response = await this.call("/productlist", { product });
    return get(response, "data.product", []);
  }

  async placeOrder(productid, userid, zoneid) {
    const payload = {
      productid,
      userid,
      zoneid,
    };
    return await this.call("/createorder", payload);
  }
}

const smileOneAdapter = new SmileOneAdapter();
module.exports = smileOneAdapter;
