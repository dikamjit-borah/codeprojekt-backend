const logger = require("./logger");

class InternalCache {
  constructor(cleanIntervalMs = 2700000) { //45 minutes
    this.cache = new Map();

    // Start background cleaner
    this.cleaner = setInterval(() => this.cleanup(), cleanIntervalMs);
  }

  getKey(key) {
    const cached = this.cache.get(key);
    return cached ? cached.value : null;
  }

  setKey(key, value, ttlMs = null) {
    const expiry = ttlMs ? Date.now() + ttlMs : null;
    this.cache.set(key, { value, expiry });
  }

  cleanup() {
    const now = Date.now();
    for (const [key, { expiry }] of this.cache.entries()) {
      if (expiry && now > expiry) {
        this.cache.delete(key);
      }
    }
    logger.info(`Cache cleanup completed. Current size: ${this.cache.size}`);
  }

  clear() {
    this.cache.clear();
  }

  stopCleanup() {
    clearInterval(this.cleaner);
  }
}

module.exports = new InternalCache(); // Singleton instance
