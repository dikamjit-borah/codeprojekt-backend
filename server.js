require("dotenv").config();
const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const {
  requestIdMiddleware,
  responseFormatter,
} = require("./middlewares/requestHandler");
const logger = require("./utils/logger");
const { fetchAppConfigs } = require("./utils/helpers");

dotenv.config();
const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request tracking and response formatting middleware
app.use(requestIdMiddleware);
app.use(responseFormatter);

// Routes
const v1Router = express.Router();
const applyAuth = require("./middlewares/auth");

app.use("/health", require("./routes/health"));

app.use("/v1", v1Router);
v1Router.use("/product", require("./routes/product"));
v1Router.use("/payment", require("./routes/payment"));
v1Router.use("/user", require("./routes/user"));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.message ?? "Internal Server Error",
    {
      requestId: req.requestId,
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    },

  );

  res.status(err.status || 500).json({
    status: err.status || 500,
    message: err.message || "Internal Server Error",
  });
});
const PORT = process.env.PORT || 8000;

async function initializeApp() {
  try {
    const db = require("./providers/mongo");
    await db.connect();

    require('./providers/queue.worker'); // Initialize queue worker
    await fetchAppConfigs();
    return true;
  } catch (error) {
    logger.error(`Failed to initialize application: ${error.message}`);
    return false;
  }
}

(async () => {
  const server = app.listen(PORT, async () => {
    const initialized = await initializeApp();
    if (!initialized) {
      logger.error("Application initialization failed. Shutting down server.");
      server.close(() => {
        process.exit(1);
      });
    } else {
      logger.info(
        `Server running on port ${PORT}, Environment: ${process.env.NODE_ENV}`
      );
      const config = require(`./config/${process.env.NODE_ENV}.js`);

      logger.info("Loaded application configuration", config);
      const socketEmitter = require("./providers/socket");
      socketEmitter.initialize(server);
    }
  });
})();


