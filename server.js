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

const { client, httpRequestsTotal, httpRequestDuration } = require('./middlewares/metrics');

app.use((req, res, next) => {
  // Start timer
  const end = httpRequestDuration.startTimer();

  // When response finishes, record metrics
  res.on('finish', () => {
    // route: try to get route pattern if available, fallback to req.path
    const route = req.route && req.route.path ? req.baseUrl + req.route.path : req.path;

    httpRequestsTotal.inc({ method: req.method, route: route, status: res.statusCode });
    end({ method: req.method, route: route, status: res.statusCode }); // records to histogram
  });

  next();
});
// Request tracking and response formatting middleware
app.use(requestIdMiddleware);
app.use(responseFormatter);

// Routes
const v1Router = express.Router();
const applyAuth = require("./middlewares/auth");

app.use("/health", require("./routes/health"));

app.use("/v1", applyAuth, v1Router);
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

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
const PORT = process.env.PORT || 8000;

async function initializeApp() {
  try {
    const db = require("./providers/mongo");
    await db.connect();

    require('./providers/queue.worker'); // Initialize queue worker
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


