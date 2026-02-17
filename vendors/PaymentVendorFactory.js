const config = require("config");
const logger = require("../utils/logger");

/**
 * Factory class to manage payment vendor instances
 * Provides centralized vendor selection and instantiation
 */
class PaymentVendorFactory {
  constructor() {
    this.vendors = new Map();
    this.defaultVendor = null;
  }

  /**
   * Register a payment vendor
   * @param {string} vendorName - Unique vendor identifier
   * @param {PaymentVendor} vendorInstance - Vendor adapter instance
   * @param {boolean} isDefault - Whether this is the default vendor
   */
  register(vendorName, vendorInstance, isDefault = false) {
    this.vendors.set(vendorName.toLowerCase(), vendorInstance);
    
    if (isDefault || !this.defaultVendor) {
      this.defaultVendor = vendorName.toLowerCase();
    }
    
    logger.info(`Registered payment vendor: ${vendorName}${isDefault ? ' (default)' : ''}`);
  }

  /**
   * Get a specific vendor by name
   * @param {string} vendorName - Vendor identifier
   * @returns {PaymentVendor} Vendor instance
   */
  getVendor(vendorName) {
    const vendor = this.vendors.get(vendorName.toLowerCase());
    
    if (!vendor) {
      throw new Error(`Payment vendor '${vendorName}' not found. Available vendors: ${Array.from(this.vendors.keys()).join(', ')}`);
    }
    
    return vendor;
  }

  /**
   * Get the default payment vendor
   * @returns {PaymentVendor} Default vendor instance
   */
  getDefaultVendor() {
    if (!this.defaultVendor) {
      throw new Error("No default payment vendor configured");
    }
    
    return this.vendors.get(this.defaultVendor);
  }

  /**
   * Get all registered vendor names
   * @returns {Array<string>} List of vendor names
   */
  getAvailableVendors() {
    return Array.from(this.vendors.keys());
  }

  /**
   * Check if a vendor is registered
   * @param {string} vendorName - Vendor identifier
   * @returns {boolean} Whether vendor exists
   */
  hasVendor(vendorName) {
    return this.vendors.has(vendorName.toLowerCase());
  }
}

// Create singleton instance
const factory = new PaymentVendorFactory();

// Auto-register vendors based on config
try {
  const matrixSolsAdapter = require("./matrixSols.adapter");
  const phonePeAdapter = require("./phonePe.adapter");
  
  // Get default vendor from config or use matrix-sols as default
  const defaultVendor = config.has("payment.defaultVendor") 
    ? config.get("payment.defaultVendor") 
    : "matrix-sols";
  
  factory.register("matrix-sols", matrixSolsAdapter, defaultVendor === "matrix-sols");
  factory.register("phonePe", phonePeAdapter, defaultVendor === "phonePe");
  
  logger.info(`Payment vendor factory initialized with default: ${defaultVendor}`);
} catch (error) {
  logger.error(`Failed to initialize payment vendors: ${error.message}`);
}

module.exports = factory;
