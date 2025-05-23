const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { requestIdMiddleware, responseFormatter } = require('./middlewares/requestHandler');
const logger = require('./utils/logger');

const productsRoutes = require('./routes/products');
const healthRoute = require('./routes/health');

dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Request tracking and response formatting middleware
app.use(requestIdMiddleware);
app.use(responseFormatter);

// Routes
app.use('/api/products', productsRoutes);
app.use('/health', healthRoute);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  }, 'Error occurred');

  res.status(500).json({
    success: false,
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
}); 