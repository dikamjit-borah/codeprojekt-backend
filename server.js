require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const {
  requestIdMiddleware,
  responseFormatter,
} = require("./middlewares/requestHandler");
const logger = require("./utils/logger");

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

app.use("/v1", v1Router); //router for versioning
v1Router.use("/product", require("./routes/product"));
v1Router.use("/payment", require("./routes/payment"));
v1Router.use("/user", require("./routes/user"));

app.use("/health", require("./routes/health"));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(
    {
      requestId: req.requestId,
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    },
    err.message ?? "Internal Server Error"
  );

  res.status(err.status || 500).json({
    status: err.status || 500,
    message: err.message || "Internal Server Error",
  });
});
const PORT = process.env.PORT || 3000;
const db = require("./utils/mongo");
db.connect();
app.listen(PORT, () => {
  logger.info(
    `Server running on port ${PORT}, Environment: ${process.env.NODE_ENV}`
  );
  logger.info("Loaded environment variables from .env file:");
  logger.info(dotenv.config().parsed);
});
