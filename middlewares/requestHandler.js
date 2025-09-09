const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

const requestIdMiddleware = (req, res, next) => {
  const requestId = uuidv4();

  // Attach request ID to the request object
  req.requestId = requestId;

  req._startTime = Date.now();
  res.setHeader("X-Request-ID", requestId);

  // Log the incoming request
  // Log in collection for analytics
  /* logger.info(
    {
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    },
    "Incoming request"
  );
 */
  next();
};

const responseFormatter = (req, res, next) => {
  req._startTime = Date.now();

  res.success = function (statusOrData, message, data) {
    let status = 200;

    if (typeof statusOrData === "number") {
      status = statusOrData;
    } else {
      data = statusOrData;
      message = "OK";
    }

    const response = {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      status,
      message,
      data,
    };

    /*  logger.info(
       {
         requestId: req.requestId,
         responseTime: Date.now() - req._startTime + "ms",
       },
       "Response sent"
     ); */

    return res.status(status).json(response);
  };

  res.error = function (statusOrError, message) {
    let status = 500;

    if (typeof statusOrError === "number") {
      status = statusOrError;
    } else {
      message = statusOrError?.message || "Internal Server Error";
    }

    const response = {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      status,
      message,
    };

    logger.error(
      {
        requestId: req.requestId,
        responseTime: Date.now() - req._startTime + "ms",
        status,
        message,
      },
      "Error response sent manually"
    );

    return res.status(status).json(response);
  };

  next();
};

const validateRequest = (schema) => {
  if (!schema || Object.keys(schema).length === 0) {
    throw new Error("Validation schema is required");
  }

  return (req, res, next) => {
    // Combine request data, safely handling null/undefined values
    const requestData = {
      ...(req.body || {}),
      ...(req.query || {}),
      ...(req.params || {})
    };

    // Validate the combined request data against the schema
    const { error } = schema.validate(requestData, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        status: 400,
        message: `Validation error: ${error.details.map(detail => detail.message).join(', ')}`,
      });
    }

    next();
  };
};

module.exports = {
  requestIdMiddleware,
  responseFormatter,
  validateRequest,
};
