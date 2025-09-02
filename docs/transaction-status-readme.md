# Transaction Status System

This system provides real-time transaction status tracking and updates for the payment flow integration.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install socket.io
```

### 2. Start the Server
```bash
npm run stage-unix
```

### 3. Test the API
```bash
# Get transaction status
curl -X GET http://localhost:3000/v1/payment/transaction/exk029jf2j3d02/status

# Update transaction stage (demo)
curl -X PUT http://localhost:3000/v1/payment/transaction/exk029jf2j3d02/stage \
  -H "Content-Type: application/json" \
  -d '{"stage": 3}'
```

### 4. Run Demo Script
```bash
node scripts/demo-transaction-status.js
```

## 📋 Features

### API Endpoints
- **GET** `/v1/payment/transaction/:transactionId/status` - Get current transaction status
- **PUT** `/v1/payment/transaction/:transactionId/stage` - Update transaction stage (demo only)

### Real-time Updates
- WebSocket integration using Socket.IO
- Transaction-specific room subscriptions
- Real-time stage updates to frontend

### Frontend Integration
- Compatible with the provided React transaction status page
- Progressive stage tracking (1-4)
- Error handling and fallback mechanisms

## 🏗️ Architecture

```
Frontend (React)
    ↓ HTTP GET
┌─────────────────┐
│  API Gateway    │ ← WebSocket connections
│  (Express)      │
└─────────────────┘
    ↓
┌─────────────────┐
│ Payment Service │ ← Business logic
└─────────────────┘
    ↓
┌─────────────────┐
│   MongoDB       │ ← Data persistence
└─────────────────┘
    ↓
┌─────────────────┐
│ Socket Emitter  │ ← Real-time updates
└─────────────────┘
```

## 🔄 Transaction Flow

1. **Stage 1**: Transaction Processing (order_initiated)
2. **Stage 2**: Payment Processing (gateway_initiated)
3. **Stage 3**: Vendor Processing (payment_success)
4. **Stage 4**: Success (order_placed)

## 📡 Socket Events

### Client → Server
- `subscribe-transaction` - Subscribe to transaction updates
- `unsubscribe-transaction` - Unsubscribe from updates

### Server → Client
- `transaction-stage` - Stage update event
- `transaction-update` - General transaction update

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Manual Testing
```bash
# Run the demo script
node scripts/demo-transaction-status.js

# Or test individual endpoints
curl -X GET http://localhost:3000/v1/payment/transaction/test-id/status
```

### Frontend Testing
1. Open your React transaction status page
2. Use transaction ID: `exk029jf2j3d02`
3. Use demo controls to test stage updates
4. Verify real-time updates via WebSocket

## 📁 File Structure

```
├── controllers/
│   └── paymentController.js      # API endpoints
├── services/
│   └── paymentService.js         # Business logic
├── routes/
│   └── payment.js               # Route definitions
├── utils/
│   └── socketEmitter.js         # WebSocket handling
├── docs/
│   ├── transaction-status-api.md # API documentation
│   └── frontend-socket-client.js # Frontend integration guide
├── scripts/
│   └── demo-transaction-status.js # Demo script
└── tests/
    └── transaction-status.test.js # Unit tests
```

## 🔧 Configuration

### Environment Variables
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/codeprojekt
```

### Frontend Socket Configuration
```javascript
const socket = io("http://localhost:3000", {
  transports: ["websocket", "polling"]
});
```

## 🚨 Production Considerations

### Security
- [ ] Add authentication middleware
- [ ] Implement rate limiting
- [ ] Validate all input parameters
- [ ] Configure CORS for production domains
- [ ] Remove demo endpoints

### Performance
- [ ] Add database indexing for `transactionId`
- [ ] Implement connection pooling
- [ ] Add caching for frequently accessed data
- [ ] Monitor socket room memory usage

### Monitoring
- [ ] Add transaction flow monitoring
- [ ] Set up error alerting
- [ ] Implement performance tracking
- [ ] Add logging for all transactions

## 🐛 Troubleshooting

### Common Issues

**Socket connection fails**
- Check server is running on correct port
- Verify CORS configuration
- Check firewall settings

**Transaction not found**
- Verify transaction ID format
- Check database connection
- Ensure transaction exists in MongoDB

**Stage updates not working**
- Check WebSocket connection
- Verify socket room subscription
- Check server logs for errors

### Debug Mode
```bash
# Enable debug logging
DEBUG=socket.io* npm run stage-unix
```

## 📚 Related Documentation

- [Payment Flow Documentation](paymentFlow/doc.md)
- [API Documentation](docs/transaction-status-api.md)
- [Frontend Integration Guide](docs/frontend-socket-client.js)

## 🤝 Contributing

1. Add tests for new features
2. Update documentation
3. Follow existing code style
4. Test both API and WebSocket functionality

## 📝 Todo

See [todo.md](todo.md) for current development tasks and progress tracking.
