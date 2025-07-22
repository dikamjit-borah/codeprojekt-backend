# Payment Service Documentation

## Overview

The Payment Service is a comprehensive solution for handling various types of payments within the application. It supports multiple payment gateways, different product types, and provides end-to-end transaction management from initiation to fulfillment.

## File Structure

```
paymentFlow
├── BaseVendorAdapter.js      # Abstract base class for vendor integrations
├── phonePay_WebHook.js       # Payment gateway webhook handler
├── queueWorker.js            # Async job processing for vendor API calls
├── Refund.js                 # Refund processing logic
├── SmileOne.adapter.js       # Implementation for SmileOne vendor
├── SocketEmitter.js          # Real-time updates via WebSockets
├── transactionStatusHandler.js # Transaction status management
├── VendorFactory.js          # Factory for vendor adapter instances
└── utility/                  # Utility functions
    ├── queueUtility.js       # Queue management utilities
    └── transactionUtlitiy.js # Transaction utilities
```

## Core Components

### Payment Service (`paymentService.js`)

Central module responsible for orchestrating the entire payment flow:
- Initiates purchase transactions
- Validates purchase types and requirements
- Manages payment gateway interactions
- Updates transaction statuses
- Processes webhook callbacks
- Fulfills purchases based on product types

### Vendor Adapters

Adapters for different payment and fulfillment vendors:
- `phonePeAdapter` - Integration with PhonePe payment gateway
- `smileOneAdapter` - Integration with SmileOne for in-game currency and items

### Transaction Management

Comprehensive transaction lifecycle management:
- Transaction creation and status tracking
- Error handling and recovery
- Webhook processing
- Purchase fulfillment

### Vendor Integration Framework

**BaseVendorAdapter.js**
- Defines the contract for all vendor integrations
- Provides common interface methods for vendor operations
- Includes error handling, logging, and retry logic

**SmileOne.adapter.js**
- Concrete implementation for SmileOne game currency vendor
- Handles API authentication, signature generation
- Implements coin purchasing, balance checking, and player verification

**VendorFactory.js**
- Factory pattern to get the appropriate vendor adapter
- Registry of available vendor implementations
- Supports dynamic vendor registration

### Payment Processing

**phonePay_WebHook.js**
- Processes payment gateway callbacks
- Validates webhook signatures for security
- Updates transaction status based on payment outcomes
- Routes transactions to appropriate processors based on product type
- Queues vendor API calls for asynchronous processing

**queueWorker.js**
- Processes vendor API calls asynchronously using Bull queue
- Implements distributed locking to prevent concurrent processing
- Handles retries with exponential backoff
- Categorizes errors for better handling and reporting
- Initiates refunds for failed transactions

### Refund Management

**Refund.js**
- Initiates refunds for failed transactions
- Processes refund callbacks from payment gateway
- Updates transaction status throughout refund lifecycle
- Provides real-time updates on refund status

### Real-time Communication

**SocketEmitter.js**
- Manages WebSocket connections for real-time updates
- Allows clients to subscribe to specific transaction updates
- Emits status changes throughout the payment lifecycle

### Utilities

**transactionUtlitiy.js**
- Implements distributed locking using Redis
- Prevents race conditions in transaction processing

**queueUtility.js**
- Handles job queuing with idempotency support
- Ensures operations aren't duplicated if reprocessed

## Supported Product Types (SPU Types)

| SPU Type | Description                                         |
|----------|-----------------------------------------------------|
| MERCH    | Physical merchandise to be shipped to the customer  |
| IGT      | In-game tokens or items fulfilled through SmileOne  |

## Transaction Statuses

### Primary Statuses
- \`PENDING\` - Transaction is in progress
- \`COMPLETED\` - Transaction successfully completed
- \`FAILED\` - Transaction failed

### Sub-Statuses
- \`ORDER_INITIATED\` - Initial order created
- \`GATEWAY_INITIATED\` - Payment gateway request initiated
- \`GATEWAY_FAILED\` - Payment gateway initiation failed
- Additional sub-statuses for tracking detailed progress

## Payment Flow

### 1. Purchase Initiation

\`\`\`javascript
purchaseSPU(spuId, spuDetails, spuType, userDetails, playerDetails, redirectUrl)
\`\`\`

This function initiates the purchase process:
1. Generates a unique transaction ID
2. Validates the SPU type and requirements
3. Creates an initial transaction record in the database
4. Initiates payment with the payment gateway
5. Returns the transaction ID and redirect URL to the client

### 2. Payment Gateway Processing

The user is redirected to the payment gateway (PhonePe) to complete their payment. Upon completion, the gateway sends a webhook notification to our system.

### 3. Webhook Processing

\`\`\`javascript
processPhonePeWebhook(headers, body)
\`\`\`

This function processes webhook callbacks from PhonePe:
1. Validates the webhook signature
2. Retrieves the associated transaction
3. Routes to the appropriate processor based on SPU type
4. Updates transaction status based on payment result

### 4. Product-Specific Processing

#### Merchandise Processing
\`\`\`javascript
processMerchPurchase(webhookData, transaction)
\`\`\`
Handles fulfillment for physical merchandise purchases.

#### In-Game Item Processing
\`\`\`javascript
processInGameItemPurchase(headers, body, transaction)
\`\`\`
Handles fulfillment for in-game items and currency:
1. Validates the callback authenticity
2. Checks for sufficient SmileCoin balance
3. Processes the in-game purchase through SmileOne

### 5. Vendor Processing

- For successful payments, item fulfillment is initiated
- For in-game items, purchase request is queued for vendor API
- Queue worker processes vendor API calls asynchronously
- Distributed locking prevents concurrent processing

### 6. Transaction Completion

- On successful vendor API call, transaction marked COMPLETED
- User notified via WebSocket with success message
- On failure, transaction marked FAILED and refund initiated
- Comprehensive error categorization for proper handling

### 7. Refund Processing

- Failed transactions trigger automatic refund
- Refund request sent to payment gateway
- Refund status tracked and updated via webhooks
- User notified of refund status via WebSocket

### 8. Reconciliation

- System identifies stuck transactions
- Administrators can trigger manual reconciliation
- Transactions can be cancelled with automatic refund
- Comprehensive audit trail maintained

## Error Handling

The service implements comprehensive error handling:
- Gateway communication errors
- Insufficient balance errors
- Validation errors
- Database errors

Each error is properly logged and results in appropriate transaction status updates.

### Error Categorization
- Network errors
- Validation errors
- Balance errors
- Server errors
- Timeout errors

### Retry Mechanism
- Automatic retries for transient failures
- Exponential backoff to avoid overwhelming vendor APIs
- Maximum retry limits with permanent failure handling

### Failure Recovery
- Automatic refunds for unrecoverable failures
- Admin notifications for manual intervention
- Detailed error logging for troubleshooting

## Transaction Status Updates

\`\`\`javascript
updateTransactionStatus(transactionId, status, subStatus, otherFields)
\`\`\`

This function provides a standardized way to update transaction statuses throughout the payment lifecycle.

## Balance Validation

\`\`\`javascript
hasSufficientSmileCoin()
\`\`\`

Validates that there is sufficient SmileCoin balance to fulfill in-game purchases, preventing failed transactions due to insufficient funds.

## Real-time Updates

The system provides real-time transaction updates to users via WebSockets:

### Client Subscription
- Clients subscribe to specific transaction updates
- Updates delivered throughout transaction lifecycle

### Update Events
- Payment status changes
- Processing status updates
- Completion confirmation
- Failure notifications
- Refund status updates

## Idempotency

The system ensures idempotent operations to prevent duplication:

### Queue Idempotency
- Unique idempotency keys for queued jobs
- Prevents duplicate processing of the same transaction

### Vendor API Idempotency
- Transaction ID used as idempotency key with vendors
- Status checking before processing to prevent duplicates

## Security Considerations

- Transaction IDs use UUID v4 for unpredictability
- Webhook validation ensures callbacks are authentic
- Database operations use proper sanitization
- Error messages are appropriately scoped to prevent information leakage

## Integration Points

| System      | Integration Type | Purpose                           |
|-------------|------------------|-----------------------------------|
| PhonePe     | Payment Gateway  | Processing payments               |
| SmileOne    | Vendor API       | In-game item fulfillment          |
| MongoDB     | Database         | Transaction storage and retrieval |
| Redis       | Queue & Cache    | Job queuing and distributed locks |

## Configuration

The service relies on the following configuration parameters:
- \`brazilianRealToSmileCoin\` - Conversion rate for calculating SmileCoin values
- Additional configuration parameters in the config file

## Monitoring and Reconciliation

The system provides tools for monitoring and reconciliation:

### Transaction Status Checking
- Detailed transaction status information
- Support for detailed status queries by admins

### Reconciliation
- Automatic identification of stuck transactions
- Admin-triggered reconciliation process
- Vendor status verification for reconciliation

## Best Practices

1. Always verify transaction status before fulfilling orders
2. Implement idempotent webhook processing to prevent duplicate fulfillment
3. Use proper error handling for all external API calls
4. Maintain detailed transaction logs for debugging and reconciliation
5. Regularly reconcile transactions to identify and resolve stuck payments

## Troubleshooting

Common issues and solutions:

1. **Failed Gateway Initiation**
   - Check PhonePe adapter configuration
   - Verify network connectivity
   - Review payment parameters

2. **Webhook Processing Failures**
   - Verify webhook signature validation
   - Check transaction lookup logic
   - Review error logs for specific failure reasons

3. **SmileCoin Balance Issues**
   - Check SmileOne API connectivity
   - Verify account balance
   - Review conversion rate configuration

4. **Queue Processing Issues**
   - Check Redis connectivity
   - Review queue worker logs
   - Verify job structure and parameters