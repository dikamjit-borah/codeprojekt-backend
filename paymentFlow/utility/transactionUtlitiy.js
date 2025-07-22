const Redis = require('ioredis');
const config = require('config');
const logger = require('./logger');

// Redis client for distributed locking
const redisClient = new Redis(config.get('redis'));

/**
 * Acquire a lock for a transaction
 * @param {string} transactionId - Transaction ID to lock
 * @param {number} ttlSeconds - Lock time-to-live in seconds
 * @returns {Promise<boolean>} True if lock acquired, false otherwise
 */
async function acquireLock(transactionId, ttlSeconds = 60) {
  const lockKey = `transaction:lock:${transactionId}`;
  
  try {
    // Try to set key only if it doesn't exist (NX) with expiry (EX)
    const result = await redisClient.set(lockKey, Date.now(), 'NX', 'EX', ttlSeconds);
    
    // If the result is 'OK', lock was acquired
    const lockAcquired = result === 'OK';
    
    if (lockAcquired) {
      logger.debug(`Lock acquired for transaction: ${transactionId}`);
    } else {
      logger.warn(`Failed to acquire lock for transaction: ${transactionId}, already being processed`);
    }
    
    return lockAcquired;
  } catch (error) {
    logger.error(`Error acquiring lock for transaction ${transactionId}: ${error.message}`);
    return false;
  }
}

/**
 * Release a lock for a transaction
 * @param {string} transactionId - Transaction ID to unlock
 * @returns {Promise<boolean>} True if lock released, false otherwise
 */
async function releaseLock(transactionId) {
  const lockKey = `transaction:lock:${transactionId}`;
  
  try {
    await redisClient.del(lockKey);
    logger.debug(`Lock released for transaction: ${transactionId}`);
    return true;
  } catch (error) {
    logger.error(`Error releasing lock for transaction ${transactionId}: ${error.message}`);
    return false;
  }
}

module.exports = {
  acquireLock,
  releaseLock
};