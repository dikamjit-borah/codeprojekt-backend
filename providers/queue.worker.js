const db = require("./mongo");
const logger = require("../utils/logger");
const { PURCHASE_STATUS } = require(".././utils/constants");

const { queue } = require("./queue.manager");
const { processGameItemPurchase } = require("../services/paymentService");
// Test queue connection first
queue
  .isReady()
  .then(() => {
    logger.info("Queue is ready and connected to Redis");
  })
  .catch((error) => {
    logger.error(`Queue connection failed: ${error.message}`);
  });

// Process game-item-purchase jobs
queue.process("game-item-purchase", async (job) => {
  const { transactionId, parsedWebhook } = job.data;
  logger.info(`Processing job ${job.id} for transaction: ${transactionId}`);

  const transaction = await db.findOne("transactions", { transactionId });

  if (!transaction) {
    throw new Error(`Transaction not found: ${transactionId}`);
  }

  // Check if transaction is already completed
  if (transaction.status === PURCHASE_STATUS.SUCCESS) {
    logger.info(
      `Transaction ${transactionId} already completed, acknowledging job ${job.id}`
    );
    return;
  }

  // Process game item purchase from vendor
  await processGameItemPurchase(transaction, parsedWebhook);

  logger.info(
    `Job ${job.id} completed successfully for transaction ${transactionId}`
  );
  return;
});

// Handle successful job completion
queue.on("completed", (job, result) => {
  logger.info(`Job ${job.id} completed:`, {
    transactionId: result.transactionId,
    success: result.success,
  });
});

// Handle job failures
queue.on("failed", (job, error) => {
  logger.error(`Job ${job.id} failed permanently:`, {
    transactionId: job.data.transactionId,
    error: error.message,
    attempts: job.attemptsMade,
  });
});

// Enhanced error handling
queue.on("error", (job, error) => {
  logger.error(`Job ${job.id} error:`, {
    message: error.message,
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    address: error.address,
    port: error.port,
  });
});
