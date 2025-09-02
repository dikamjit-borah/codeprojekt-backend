# Transaction Status API Documentation

## Overview

This API provides endpoints for managing and tracking transaction statuses in real-time, designed to work with the frontend transaction status page.

## Base URL
```
http://localhost:3000/v1/payment
```

## Endpoints

### 1. Get Transaction Status

**GET** `/transaction/:transactionId/status`

Retrieves the current status and stage of a transaction.

#### Parameters
- `transactionId` (string, required) - The unique transaction identifier

#### Response
```json
{
  "status": 200,
  "message": "Transaction status retrieved successfully",
  "data": {
    "transactionId": "exk029jf2j3d02",
    "status": "pending",
    "subStatus": "gateway_initiated",
    "stage": 2,
    "spuId": "product123",
    "spuType": "inGameItem",
    "spuDetails": {
      "price": 100,
      "currency": "BRL",
      "name": "Gaming Pack"
    },
    "userDetails": {
      "userId": "user123",
      "email": "user@example.com"
    },
    "createdAt": "2025-08-11T10:00:00Z",
    "updatedAt": "2025-08-11T10:05:00Z",
    "lastUpdated": "2025-08-11T10:05:00Z"
  }
}
```

#### Error Responses
- `404` - Transaction not found
- `400` - Invalid transaction ID

### 2. Update Transaction Stage (Demo/Testing)

**PUT** `/transaction/:transactionId/stage`

Updates the transaction stage for testing purposes. **Should be removed in production.**

#### Parameters
- `transactionId` (string, required) - The unique transaction identifier

#### Request Body
```json
{
  "stage": 3
}
```

#### Response
```json
{
  "status": 200,
  "message": "Transaction stage updated to 3",
  "data": {
    "stage": 3
  }
}
```

## Transaction Stages

The API uses a 4-stage system that maps to the frontend progress tracker:

| Stage | Title | Description | Status | SubStatus |
|-------|-------|-------------|---------|-----------|
| 1 | Transaction Processing | Initializing your transaction | pending | order_initiated |
| 2 | Payment Processing | Processing your payment | pending | gateway_initiated |
| 3 | Vendor Processing | Fulfilling your order | pending | payment_success |
| 4 | Success | Transaction completed successfully | success | order_placed |

## WebSocket Integration

### Connection
Connect to the server using Socket.IO:
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");
```

### Events

#### Client → Server Events

**subscribe-transaction**
Subscribe to updates for a specific transaction:
```javascript
socket.emit("subscribe-transaction", "exk029jf2j3d02");
```

**unsubscribe-transaction**
Unsubscribe from transaction updates:
```javascript
socket.emit("unsubscribe-transaction", "exk029jf2j3d02");
```

#### Server → Client Events

**transaction-stage**
Emitted when a transaction stage changes:
```javascript
socket.on("transaction-stage", (payload) => {
  console.log("Stage update:", payload);
  // payload: { transactionId, stage, status, subStatus }
});
```

**transaction-update**
Emitted for general transaction updates:
```javascript
socket.on("transaction-update", (payload) => {
  console.log("Transaction update:", payload);
  // payload: { status, subStatus, stage, ...otherFields }
});
```

## Frontend Integration Example

```javascript
import React, { useState, useEffect } from "react";
import { getSocket } from "../utils/socketClient";

const TransactionStatusPage = ({ transactionId }) => {
  const [currentStage, setCurrentStage] = useState(1);

  useEffect(() => {
    // Initial API call to get current status
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/v1/payment/transaction/${transactionId}/status`);
        if (res.ok) {
          const data = await res.json();
          setCurrentStage(data.data.stage);
        }
      } catch (err) {
        console.error("Failed to fetch status:", err);
      }
    };

    fetchStatus();

    // Socket integration for real-time updates
    const socket = getSocket();
    
    // Subscribe to transaction updates
    socket.emit("subscribe-transaction", transactionId);
    
    // Listen for stage updates
    socket.on("transaction-stage", (payload) => {
      if (payload.transactionId === transactionId) {
        setCurrentStage(payload.stage);
      }
    });

    // Cleanup
    return () => {
      socket.emit("unsubscribe-transaction", transactionId);
      socket.off("transaction-stage");
    };
  }, [transactionId]);

  // Rest of component...
};
```

## Error Handling

All endpoints return standardized error responses:

```json
{
  "status": 404,
  "message": "Transaction not found"
}
```

Common error codes:
- `400` - Bad request (invalid parameters)
- `404` - Transaction not found
- `500` - Internal server error

## Testing

### Manual Testing with curl

1. **Get transaction status:**
```bash
curl -X GET http://localhost:3000/v1/payment/transaction/exk029jf2j3d02/status
```

2. **Update stage (testing only):**
```bash
curl -X PUT http://localhost:3000/v1/payment/transaction/exk029jf2j3d02/stage \
  -H "Content-Type: application/json" \
  -d '{"stage": 3}'
```

### Socket Testing

Use a Socket.IO client or browser console to test real-time updates:

```javascript
// In browser console
const socket = io();
socket.emit("subscribe-transaction", "exk029jf2j3d02");
socket.on("transaction-stage", console.log);
```

## Security Considerations

1. **Authentication**: Add proper authentication middleware for production
2. **Rate Limiting**: Implement rate limiting for API endpoints
3. **Input Validation**: Validate all input parameters
4. **CORS**: Configure CORS properly for production domains
5. **Remove Demo Endpoints**: Remove the stage update endpoint in production

## Performance Considerations

1. **Database Indexing**: Ensure `transactionId` is indexed in MongoDB
2. **Connection Pooling**: Use connection pooling for database connections
3. **Socket Room Management**: Properly manage socket rooms to prevent memory leaks
4. **Caching**: Consider caching frequently accessed transaction data

## Dependencies

Required npm packages:
- `socket.io` - Real-time communication
- `express` - Web framework
- `mongodb` - Database driver
- `uuid` - Transaction ID generation
- `http-errors` - Error handling
