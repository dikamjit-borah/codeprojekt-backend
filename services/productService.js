const { evaluateRules } = require("../utils/ruleEngine");
const smileOneAdapter = require("../vendors/smileone.adapter");

const getSPUsForProduct = async (product) => {
  try {
    const productSPUs = await smileOneAdapter.fetchProductSPUs(product);
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
        all: [
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
