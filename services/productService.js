const config = require("config");
const { evaluateRules } = require("../utils/ruleEngine");
const smileoneAdapter = require("../vendors/smileone.adapter");
const createHttpError = require("http-errors");
const db = require("../utils/mongo");

const getSPUsForProduct = async (product) => {
  const productSPUs = await smileoneAdapter.fetchProductSPUs(product);
  if (!productSPUs || productSPUs.length === 0) {
    throw createHttpError(404, "No SPUs found for the given product");
  }
  const configsForCategorization = await db.find("configs-category");
  const categorizedProducts = await categorizeProducts(
    productSPUs,
    configsForCategorization
  );

  db.updateOne(
    "spus",
    { product },
    { $set: { product, categorizedProducts } } // either updates or inserts
  );

  return categorizedProducts;
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

  const categorizedProducts = evaluationResults.map(
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

  return categorizedProducts;
}

module.exports = {
  getSPUsForProduct,
};
