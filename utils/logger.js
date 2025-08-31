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
    
    // Stack trace when called from logger.info:
    // 0: Error
    // 1: at getCaller (logger.js:...)
    // 2: at Object.info (logger.js:...)  
    // 3: at actual caller location <- This is what we want
    
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
  
  return 'unknown:unknown';
}

// Create wrapper functions that include caller information
const logger = {
  info: (msg, ...args) => {
    const caller = getCaller();
    if (typeof msg === 'object') {
      baseLogger.info(msg, ...args);
    } else {
      baseLogger.info(`${caller} ${msg}`, ...args);
    }
  },
  
  error: (msg, ...args) => {
    const caller = getCaller();
    if (typeof msg === 'object') {
      baseLogger.error(msg, ...args);
    } else {
      baseLogger.error(`${caller} ${msg}`, ...args);
    }
  },
  
  warn: (msg, ...args) => {
    const caller = getCaller();
    if (typeof msg === 'object') {
      baseLogger.warn(msg, ...args);
    } else {
      baseLogger.warn(`${caller} ${msg}`, ...args);
    }
  },
  
  debug: (msg, ...args) => {
    const caller = getCaller();
    if (typeof msg === 'object') {
      baseLogger.debug(msg, ...args);
    } else {
      baseLogger.debug(`${caller} ${msg}`, ...args);
    }
  },
  
  trace: (msg, ...args) => {
    const caller = getCaller();
    if (typeof msg === 'object') {
      baseLogger.trace(msg, ...args);
    } else {
      baseLogger.trace(`${caller} ${msg}`, ...args);
    }
  },
  
  fatal: (msg, ...args) => {
    const caller = getCaller();
    if (typeof msg === 'object') {
      baseLogger.fatal(msg, ...args);
    } else {
      baseLogger.fatal(`${caller} ${msg}`, ...args);
    }
  }
};

module.exports = logger;
