const config = require("config");
const { evaluateRules } = require("../utils/ruleEngine");
const smileoneAdapter = require("../vendors/smileone.adapter");

const getSPUsForProduct = async (product) => {
  try {
    const productSPUs = await smileoneAdapter.fetchProductSPUs(product);
    if (!productSPUs || productSPUs.length === 0) {
      throw new Error("No SPUs found for the given product");
    }
    const configs = await fetchConfigsForCategories();
    const categorizedProducts = await categorizeProducts(productSPUs, configs);

    return categorizedProducts;
  } catch (error) {
    throw new Error(`Error fetching product list: ${error.message}`);
  }
};

async function fetchConfigsForCategories() {
  return [
    {
      conditions: {
        any: [
          {
            fact: "name",
            operator: "includes",
            value: "Passe",
          },
          {
            fact: "name",
            operator: "includes",
            value: "Passagem",
          },
        ],
      },
      event: {
        type: "category",
        params: { category: "Pass" },
      },
    },

    {
      conditions: {
        all: [
          {
            fact: "name",
            operator: "includes",
            value: "&",
          },
          {
            fact: "name",
            operator: "includes",
            value: "Diamond",
          },
        ],
      },
      event: {
        type: "category",
        params: { category: "Bonus Pack" },
      },
    },

    {
      conditions: {
        all: [
          {
            fact: "name",
            operator: "notIncludes",
            value: "&",
          },
          {
            fact: "name",
            operator: "includes",
            value: "Diamond",
          },
        ],
      },
      event: {
        type: "category",
        params: { category: "Basic Pack" },
      },
    },
  ];
}

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
