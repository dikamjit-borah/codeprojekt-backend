const config = require('config');
const logger = require('../utils/logger');
const smileOneAdapter = require('./SmileOne.adapter');
// Future vendor imports would go here
// const newVendorAdapter = require('./newVendor.adapter');

/**
 * Factory to get the appropriate vendor adapter
 */
class VendorFactory {
  constructor() {
    this.adapters = {
      'smileone': smileOneAdapter,
      // Add new vendors here as they are implemented
      // 'newvendor': newVendorAdapter,
    };
    
    this.defaultVendor = config.get('defaultVendor') || 'smileone';
  }

  /**
   * Get vendor adapter by vendor ID
   * @param {string} vendorId Vendor identifier
   * @returns {Object} Vendor adapter instance
   */
  getVendor(vendorId = null) {
    const vendor = vendorId || this.defaultVendor;
    const adapter = this.adapters[vendor.toLowerCase()];
    
    if (!adapter) {
      logger.error(`No adapter found for vendor: ${vendor}`);
      throw new Error(`Unsupported vendor: ${vendor}`);
    }
    
    return adapter;
  }

  /**
   * Get all available vendor adapters
   * @returns {Object} Map of vendor ID to adapter
   */
  getAllVendors() {
    return this.adapters;
  }

  /**
   * Register a new vendor adapter
   * @param {string} vendorId Vendor identifier
   * @param {Object} adapter Vendor adapter instance
   */
  registerVendor(vendorId, adapter) {
    if (this.adapters[vendorId]) {
      logger.warn(`Overriding existing vendor adapter: ${vendorId}`);
    }
    
    this.adapters[vendorId] = adapter;
    logger.info(`Registered vendor adapter: ${vendorId}`);
  }
}

// Export singleton instance
const vendorFactory = new VendorFactory();
module.exports = vendorFactory;