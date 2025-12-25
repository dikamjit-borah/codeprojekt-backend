const Queue = require("bull");
const config = require("config");
const logger = require("../utils/logger");
const redis = require("redis");

const options = {
  redis: {
    port: config.redis.port,
    host: config.redis.host,
    username: config.redis.username,
    password: config.redis.password || undefined,
    tls: true, //set TLS to true only for stage on render
    db: config.redis.database || 0,
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
}
// Initialize vendor queue with Redis backend
const queue = new Queue("vendor-api-calls", options);

// Queue health monitoring
queue
  .on("error", (error) => logger.error("Queue manager error:", error))
  .on("waiting", (jobId) => logger.info(`Job ${jobId} is waiting`))
  .on("completed", (job, result) =>
    logger.info(`Job ${job.id} completed`, result)
  )
  .on("failed", (job, error) =>
    logger.error(`Job ${job.id} failed: ${error.message}`)
  );

/**
 * Add a job to the vendor queue with idempotency key
 * @param {string} jobName - Type of job to process
 * @param {Object} jobData - Job data including transactionId
 * @param {Object} options - Queue options
 * @returns {Promise<Object>} Job instance
 */
async function addJob(jobName, jobData) {
  const { transactionId } = jobData;
  if (!transactionId) throw new Error("Transaction ID is required for queuing");

  const idempotencyKey = `${jobName}:${transactionId}`;

  try {
    const existingJobs = await queue.getJobs(["active", "waiting", "delayed"]);
    const duplicate = existingJobs.find(
      (job) => job.data.idempotencyKey === idempotencyKey
    );

    if (duplicate) {
      logger.info(
        `Job already in queue: ${idempotencyKey}, jobId: ${duplicate.id}`
      );
      return duplicate;
    }

    const enrichedJobData = {
      ...jobData,
      idempotencyKey,
      queuedAt: new Date(),
    };
    const job = await queue.add(jobName, enrichedJobData, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });

    logger.info(
      `Added job: ${job.id}, type: ${jobName}, transactionId: ${transactionId}`
    );
    return job;
  } catch (error) {
    logger.error(`Failed to add job: ${error.message}`, {
      jobId,
      jobName,
      transactionId,
    });
  }
}

module.exports = { queue, addJob };
