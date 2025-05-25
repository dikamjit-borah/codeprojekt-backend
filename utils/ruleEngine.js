const { Engine } = require("json-rules-engine");

class RuleEngine {
  constructor() {
    if (!RuleEngine.instance) {
      this.engine = new Engine();
      this.operatorsAdded = false;
      RuleEngine.instance = this;
    }

    return RuleEngine.instance;
  }

  getEngine() {
    if (!this.operatorsAdded) {
      this.engine.addOperator("includes", (factValue, jsonValue) => {
        if (typeof factValue !== "string") return false;
        return factValue.toLowerCase().includes(jsonValue.toLowerCase());
      });
      this.engine.addOperator("notIncludes", (factValue, jsonValue) => {
        if (typeof factValue !== "string") return false;
        return !factValue.toLowerCase().includes(jsonValue.toLowerCase());
      });
      this.operatorsAdded = true;
    }
    return this.engine;
  }
}

const ruleEngine = new RuleEngine();

async function evaluateRules(factsList, rulesConfig, extractFacts) {
  const engine = ruleEngine.getEngine();

  // Clear existing rules to avoid duplicates during multiple calls
  engine.rules = [];
  rulesConfig.forEach((rule) => engine.addRule(rule));

  const results = [];

  for (const item of factsList) {
    const facts = extractFacts(item);
    const { events } = await engine.run(facts);

    results.push({
      originalItem: item,
      matchedEvents: events || [],
    });
  }

  return results;
}

module.exports = { evaluateRules };
