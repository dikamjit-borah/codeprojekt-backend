const config = require("config");
const logger = require("../utils/logger");
const { evaluateRules } = require("../utils/ruleEngine");
const smileoneAdapter = require("../vendors/smileone.adapter");
const createHttpError = require("http-errors");
const db = require("../utils/mongo");
const { generateHash } = require("../utils/helpers");
import { groupBy } from "lodash";

const getSPUsForProduct = async (product) => {
  const [productSPUs, existingSpusDoc] = await Promise.all([
    smileoneAdapter.fetchProductSPUs(product),
    db.findOne("spus", { product }),
  ]);

  if (!productSPUs || (productSPUs.length === 0 && !existingSpusDoc)) {
    throw createHttpError(404, "No SPUs found for the given product");
  }

  const currentHash = generateHash(productSPUs);

  if (existingSpusDoc?.hash === currentHash) {
    logger.info("No change in SPUs. Skipping update.");
    const spusModifiedDoc = await db.findOne("spus-modified", { product });
    return spusModifiedDoc?.categorizedSPUs ?? [];
  }

  const updateSpusPromise = db.updateOne(
    "spus",
    { product },
    { $set: { product, productSPUs, hash: currentHash } },
    { upsert: true }
  );

  const configsForCategorization = await db.find("configs-category");
  const categorizedSPUs = await categorizeProducts(
    productSPUs,
    configsForCategorization
  );

  const updateModifiedPromise = db.updateOne(
    "spus-modified",
    { product },
    { $set: { product, categorizedSPUs, hash: currentHash } },
    { upsert: true }
  );

  Promise.all([updateSpusPromise, updateModifiedPromise]);
  return groupBy(data, 'category');

  ;
};

function extractFacts(product) {
  return {
    name: product.spu.toLowerCase(),
  };
}

async function categorizeProducts(products, rulesConfig) {
  const evaluationResults = await evaluateRules(
    products,
    rulesConfig,
    extractFacts
  );

  const categorizedSPUs = evaluationResults.map(
    ({ originalItem, matchedEvents }) => {
      const categoryEvent = matchedEvents.find(
        (event) => event.type === "category"
      );
      return {
        ...originalItem,
        price_inr: parseFloat(
          (
            parseFloat(originalItem.price) * config.get("brazilianRealToINR")
          ).toFixed(2)
        ),
        category: categoryEvent
          ? categoryEvent.params.category
          : "Uncategorized",
      };
    }
  );

  return categorizedSPUs;
}

module.exports = {
  getSPUsForProduct,
};
