const Queue = require('bull');
const config = require('config');
const logger = require('./logger');

// Create vendor queue with Redis backend
const vendorQueue = new Queue('vendor-api-calls', {
  redis: config.get('redis'),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
  }
});

// Queue health monitoring
vendorQueue.on('error', (error) => {
  logger.error('Queue error:', error);
});

vendorQueue.on('waiting', (jobId) => {
  logger.info(`Job ${jobId} is waiting`);
});

vendorQueue.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed:`, result);
});

vendorQueue.on('failed', (job, error) => {
  logger.error(`Job ${job.id} failed:`, error.message);
});

/**
 * Add a job to the vendor queue with idempotency key
 * @param {string} jobType - Type of job to process
 * @param {Object} jobData - Job data including transactionId
 * @param {Object} options - Queue options
 * @returns {Promise<Object>} Job instance
 */
async function addJob(jobType, jobData, options = {}) {
  const { transactionId } = jobData;
  
  if (!transactionId) {
    throw new Error('Transaction ID is required for queuing');
  }
  
  // Create a unique idempotency key based on job type and transaction ID
  const idempotencyKey = `${jobType}:${transactionId}`;
  
  try {
    // Check if job with this idempotency key is already in the queue
    const existingJobs = await vendorQueue.getJobs(['active', 'waiting', 'delayed']);
    const duplicate = existingJobs.find(job => 
      job.data.idempotencyKey === idempotencyKey
    );
    
    if (duplicate) {
      logger.info(`Job already in queue with idempotency key: ${idempotencyKey}, jobId: ${duplicate.id}`);
      return duplicate;
    }
    
    // Add idempotency key to job data
    const enrichedJobData = {
      ...jobData,
      idempotencyKey,
      queuedAt: new Date()
    };
    
    // Add job to queue with the provided options
    const job = await vendorQueue.add(jobType, enrichedJobData, options);
    logger.info(`Added job to queue: ${job.id}, type: ${jobType}, transactionId: ${transactionId}`);
    
    return job;
  } catch (error) {
    logger.error(`Failed to add job to queue: ${error.message}`, { jobType, transactionId });
    throw error;
  }
}

module.exports = {
  queue: vendorQueue,
  addJob
};
