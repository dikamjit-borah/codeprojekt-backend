const socketIO = require("socket.io");
const logger = require("../utils/logger");

class Socket {
  constructor() {
    this.io = null;
    this.initialized = false;
  }

  /**
   * Initialize socket.io server
   * @param {Object} server HTTP server instance
   */
  initialize(server) {
    if (this.initialized) {
      return;
    }

    try {
      this.io = socketIO(server, {
        cors: {
          origin: "*", // Configure as needed for production
          methods: ["GET", "POST"],
        },
      });

      this.io.on("connection", (socket) => {
        logger.info(`Socket connected: ${socket.id}`);

        // Handle transaction subscriptions
        socket.on("subscribe-transaction", (transactionId) => {
          logger.debug(
            `Socket ${socket.id} subscribed to transaction ${transactionId}`
          );
          socket.join(`transaction:${transactionId}`);
        });

        // Handle unsubscribe
        socket.on("unsubscribe-transaction", (transactionId) => {
          logger.debug(
            `Socket ${socket.id} unsubscribed from transaction ${transactionId}`
          );
          socket.leave(`transaction:${transactionId}`);
        });

        // Handle disconnect
        socket.on("disconnect", () => {
          logger.info(`Socket disconnected: ${socket.id}`);
        });
      });

      this.initialized = true;
      logger.info("Socket.IO server initialized");
    } catch (error) {
      logger.error(`Failed to initialize Socket.IO: ${error.message}`);
    }
  }

  /**
   * Emit event to all clients or to specific room
   * @param {string} event Event name
   * @param {Object} data Event data
   * @param {string} room Optional room name
   */
  emit(event, data, room = null) {
    if (!this.initialized || !this.io) {
      logger.warn(`Socket.IO not initialized, can't emit ${event}`);
      return;
    }

    try {
      if (room) {
        this.io.to(room).emit(event, data);
        logger.debug(`Emitted ${event} to room ${room}`);
      } else {
        this.io.emit(event, data);
        logger.debug(`Emitted ${event} to all clients`);
      }
    } catch (error) {
      logger.error(`Failed to emit ${event}: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new Socket();
