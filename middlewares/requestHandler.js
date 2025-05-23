const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

const requestIdMiddleware = (req, res, next) => {
  const requestId = uuidv4();

  // Attach request ID to the request object
  req.requestId = requestId;

  req._startTime = Date.now();
  res.setHeader("X-Request-ID", requestId);

  // Log the incoming request
  logger.info(
    {
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    },
    "Incoming request"
  );

  next();
};

const responseFormatter = (req, res, next) => {
  // Store the original json method
  const originalJson = res.json;

  // Override the json method
  res.json = function (data) {
    const formattedResponse = {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      data: data,
    };

    if (data && typeof data === "object" && "status" in data) {
      res.status(data.status);
    }

    logger.info(
      {
        requestId: req.requestId,
        responseTime: Date.now() - req._startTime + "ms",
      },
      "Response sent"
    );

    // Call the original json method with formatted data
    return originalJson.call(this, formattedResponse);
  };

  next();
};

module.exports = {
  requestIdMiddleware,
  responseFormatter,
};
