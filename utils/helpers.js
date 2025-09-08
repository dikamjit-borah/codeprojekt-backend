const crypto = require("crypto");
const mongo = require("../providers/mongo");
const cache = require("../utils/internalCache");


function generateHash(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

async function fetchAppConfigs() {
  const cacheKey = `configs:app`;

  const cached = cache.getKey(cacheKey);
  if (cached) {
    return cached;
  }

  const configs = await mongo.find("configs-app");
  cache.setKey(cacheKey, configs, 86400000); // Cache for 24 hours
  return configs;
}

module.exports = {
  generateHash,
  fetchAppConfigs
};
