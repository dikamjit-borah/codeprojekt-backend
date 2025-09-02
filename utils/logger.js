const pino = require("pino");

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "debug",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  }
});

// Function to get the caller file and line number
function getCaller() {
  try {
    const err = new Error();
    const stack = err.stack.split('\n');

    // Start from index 3 and find the first line that's not in logger.js
    for (let i = 3; i < stack.length; i++) {
      const line = stack[i];

      if (line &&
        !line.includes('logger.js') &&
        !line.includes('node_modules') &&
        !line.includes('node:internal')) {

        // Extract file path and line number using regex
        const match = line.match(/\(([^)]+)\)/) || line.match(/at\s+([^(]+)/);
        if (match && match[1]) {
          const pathInfo = match[1].trim();
          const parts = pathInfo.split(':');
          if (parts.length >= 2 && parts[0].includes('.js')) {
            const filePath = parts[0];
            const lineNumber = parts[1];
            const fileName = filePath.split('/').pop();
            return `${fileName}:${lineNumber}`;
          }
        }
      }
    }
  } catch (e) {
    // Ignore errors
  }

  return '';
}

// Helper function to create log methods
function createLogMethod(level) {
  return (msg, ...args) => {
    const caller = getCaller();
    if (typeof msg === 'object') {
      baseLogger[level](msg, ...args);
    } else {
      baseLogger[level](`${caller} ${msg}`, ...args);
    }
  };
}

// Create logger with dynamic methods
const logger = {
  info: createLogMethod('info'),
  error: createLogMethod('error'),
  warn: createLogMethod('warn'),
  debug: createLogMethod('debug'),
  trace: createLogMethod('trace'),
  fatal: createLogMethod('fatal'),
};

module.exports = logger;
