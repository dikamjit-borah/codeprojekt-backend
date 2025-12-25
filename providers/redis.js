const redis = require("redis");
const config = require("config");
const logger = require("../utils/logger");

/**
 * Check if Redis is available and accessible
 * This creates a temporary test connection that is immediately closed after verification
 * @returns {Promise<boolean>} True if Redis is available, false otherwise
 */
async function isRedisAvailable() {
  let client = null;
  let isAvailable = false; // Store result to avoid finally block overriding return

  try {
    const redisConfig = config.get("redis");
    logger.info(`Checking Redis at ${redisConfig.host}:${redisConfig.port}`);

    // Create Redis client with modern configuration
    client = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        connectTimeout: 3000,
      },
      username: redisConfig.username,
      password: redisConfig.password,
      database: redisConfig.db || 0,
      tls: true, //set TLS to true only for stage on render
    });
    logger.info(`Checking Redis at ${redisConfig.host}:${redisConfig.port}`);
    
    // Connect to Redis
    await client.connect();
    logger.info("Redis connected successfully");

    // Test PING command
    const result = await client.ping();
    if (result !== "PONG") {
      throw new Error(`Invalid PING response: ${result}`);
    }

    logger.info("Redis PING successful");
    isAvailable = true; // Set success flag
  } catch (error) {
    logger.error(`Redis not available: ${error.message}`);
    isAvailable = false; // Set failure flag
  } finally {
    // Always cleanup the health check connection
    // This is a temporary test connection, not the actual application connection
    if (client) {
      try {
        if (client.isOpen) {
          // DON'T await here - just fire and forget
          client.quit().catch(() => {
            // Ignore quit errors
          });
          logger.info("Health check connection cleanup initiated");
        } else {
          // Force disconnect if connection was never established
          client.disconnect();
          logger.info("Failed connection cleaned up");
        }
      } catch (cleanupError) {
        // Don't let cleanup errors affect the health check result
        logger.warn(
          `Warning during health check cleanup: ${cleanupError.message}`
        );
      }
    }
  }

  return isAvailable; // Return the stored result (not affected by finally block errors)
}

module.exports = {
  isRedisAvailable,
};
