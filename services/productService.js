const config = require("config");
const logger = require("../utils/logger");
const { evaluateRules } = require("../utils/ruleEngine");
const smileOneAdapter = require("../vendors/smileOne.adapter");
const createHttpError = require("http-errors");
const db = require("../providers/mongo");
const { generateHash } = require("../utils/helpers");
const { groupBy, map, reject } = require("lodash");
const cache = require("../utils/internalCache");

const fetchSPUsFromVendor = async (product) => {
  const [vendorSPUs, vendorSpusDoc, modifiedSpusDoc] = await Promise.all([
    smileOneAdapter.fetchProductSPUs(product),
    db.findOne("spus", { product }),
    db.findOne("spus-modified", { product }),
  ]);

  if (!vendorSPUs?.length && !vendorSpusDoc && !modifiedSpusDoc) {
    throw createHttpError(404, "No SPUs found for the given product");
  }

  const currentHash = generateHash(vendorSPUs);
  const existingCategorizedSPUs = modifiedSpusDoc?.categorizedSPUs ?? [];

  if (vendorSpusDoc?.hash === currentHash) {
    logger.info("No change in SPUs. Skipping update.");
    return combinedSPUs(vendorSPUs, existingCategorizedSPUs);
  }

  logger.info("Change detected in SPUs. Updating database.");
  db.updateOne(
    "spus",
    { product },
    { $set: { product, vendorSPUs, hash: currentHash } },
    { upsert: true }
  );

  const existingIds = new Set(map(existingCategorizedSPUs, "id"));
  const newSPUs = reject(vendorSPUs, (spu) => existingIds.has(spu.id));

  if (!newSPUs.length) return combinedSPUs(vendorSPUs, existingCategorizedSPUs);

  logger.info(`Found ${newSPUs.length} new SPUs. Adding to database.`);

  const allCategorizedSPUs = [
    ...existingCategorizedSPUs,
    ...map(newSPUs, (spu) => ({ ...spu, price_inr: 100, category: "Uncategorized", isActive: false })),
  ];

  db.updateOne(
    "spus-modified",
    { product },
    { $set: { product, categorizedSPUs: allCategorizedSPUs } },
    { upsert: true }
  );

  return combinedSPUs(vendorSPUs, allCategorizedSPUs);
};

const combinedSPUs = (vendor, categorizedSPUs) => ({
  vendor,
  categorized: groupBy(categorizedSPUs, "category"),
});

function extractFacts(product) {
  return {
    name: product.spu.toLowerCase(),
  };
}

async function categorizeProducts(products, rulesConfig) {
  const evaluationResults = await evaluateRules(
    products,
    rulesConfig,
    extractFacts,
  );

  const brazilianRealToINR = (await fetchAppConfigs())[0].brazilianRealToINR;
  const categorizedSPUs = evaluationResults.map(
    ({ originalItem, matchedEvents }) => {
      const categoryEvent = matchedEvents.find(
        (event) => event.type === "category",
      );
      return {
        ...originalItem,
        price_inr: parseFloat(
          (
            parseFloat(originalItem.price) * parseFloat(brazilianRealToINR)
          ).toFixed(2),
        ),
        category: categoryEvent
          ? categoryEvent.params.category
          : "Uncategorized",
      };
    },
  );

  return categorizedSPUs;
}

const getCategorizedSPUsForProduct = async (product) => {
  const spusDoc = await db.findOne("spus-modified", { product });
  const activeSPUs = spusDoc?.categorizedSPUs?.filter((spu) => spu.isActive);
  return groupBy(activeSPUs, "category");
};

const getMerch = async () => {
  return await db.find("merch", {});
};

const getSmileCoins = async () => {
  return await smileOneAdapter.fetchSmilecoinBalance();
};

module.exports = {
  fetchSPUsFromVendor,
  getCategorizedSPUsForProduct,
  getMerch,
  getSmileCoins,
};
