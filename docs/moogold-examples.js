/**
 * MooGold Adapter - Usage Examples
 * 
 * This file demonstrates how to use the MooGold adapter in your application.
 * Copy and adapt these examples for your specific use case.
 */

const moogoldAdapter = require('../vendors/moogold.adapter');

// ============================================================
// EXAMPLE 1: Basic Wallet Operations
// ============================================================

async function checkWalletAndReload() {
  try {
    // Check current balance
    const balance = await moogoldAdapter.getBalance();
    console.log(`Current balance: ${balance.balance} ${balance.currency}`);

    // If balance is low, reload it
    if (balance.balance < 100) {
      const reload = await moogoldAdapter.reloadBalance({
        amount: 1000
      });
      console.log(`Reload initiated:`);
      console.log(`- Order ID: ${reload.orderId}`);
      console.log(`- Send to: ${reload.paymentAddress}`);
      console.log(`- Amount: ${reload.amount}`);
      console.log(`- Wallet currency: ${reload.walletCurrency}`);
    }
  } catch (error) {
    console.error('Wallet operation failed:', error.message);
  }
}

// ============================================================
// EXAMPLE 2: Browse Products & Categories
// ============================================================

async function browseProducts() {
  try {
    // Category IDs
    const categories = {
      DIRECT_TOPUP: 50,
      GIFT_CARDS: 51,
      AMAZON: 1391,
      GOOGLE_PLAY: 538,
      STEAM: 993,
      NETFLIX: 874,
      SPOTIFY: 992,
      PSN: 765,
      XBOX: 3154,
      ROBLOX: 3563,
      GARENA: 766,
      LEAGUEOFLEGENDS: 1223
    };

    // List Direct Top Up products
    console.log('\n=== Direct Top Up Products ===');
    const topupProducts = await moogoldAdapter.listProducts(categories.DIRECT_TOPUP);
    topupProducts.forEach(product => {
      console.log(`- ${product.name} (ID: ${product.id})`);
    });

    // List Steam products
    console.log('\n=== Steam Products ===');
    const steamProducts = await moogoldAdapter.listProducts(categories.STEAM);
    steamProducts.forEach(product => {
      console.log(`- ${product.name} (ID: ${product.id})`);
    });

    // Get details for first product
    if (topupProducts.length > 0) {
      const productId = topupProducts[0].id;
      const details = await moogoldAdapter.getProductDetail(productId);
      console.log(`\n=== Product Details for ${details.name} ===`);
      console.log(`Image: ${details.imageUrl}`);
      console.log('Variations:');
      details.variations.forEach(v => {
        console.log(`  - ${v.variationName}: $${v.variationPrice} (ID: ${v.variationId})`);
      });
    }
  } catch (error) {
    console.error('Product browsing failed:', error.message);
  }
}

// ============================================================
// EXAMPLE 3: Create Order (Complete Workflow)
// ============================================================

async function createOrderWorkflow() {
  try {
    // Step 1: Get product details
    const productId = 7847; // Garena Free Fire
    const productDetail = await moogoldAdapter.getProductDetail(productId);
    console.log(`\nProduct: ${productDetail.name}`);
    console.log('Available variations:');
    productDetail.variations.forEach(v => {
      console.log(`  - ${v.variationName}: $${v.variationPrice}`);
    });

    // Step 2: Check if product has servers
    try {
      const servers = await moogoldAdapter.getServerList(productId);
      console.log('\nAvailable servers:');
      servers.servers.forEach(s => {
        console.log(`  - ${s.name}: ${s.id}`);
      });
    } catch (e) {
      console.log('No servers available for this product');
    }

    // Step 3: Validate user account before ordering
    const variationId = productDetail.variations[0].variationId;
    const playerId = '12314123'; // User's in-game ID
    const serverId = '3402'; // Selected server

    const validation = await moogoldAdapter.validateProduct({
      productId: productId,
      data: {
        'User ID': playerId,
        'Server': serverId
      }
    });

    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.message}`);
    }
    console.log(`\nAccount validated: ${validation.username}`);

    // Step 4: Create the order
    const partnerOrderId = `ORDER-${Date.now()}`; // Your unique order ID
    const order = await moogoldAdapter.createOrder({
      category: 1, // Direct Top Up
      productId: variationId,
      quantity: 1,
      userId: playerId,
      serverId: serverId,
      partnerOrderId: partnerOrderId
    });

    console.log(`\nOrder created successfully!`);
    console.log(`- MooGold Order ID: ${order.orderId}`);
    console.log(`- Partner Order ID: ${partnerOrderId}`);
    console.log(`- Player ID: ${order.playerId}`);
    console.log(`- Server ID: ${order.serverId}`);

    return order.orderId;

  } catch (error) {
    console.error('Order creation failed:', error.message);
  }
}

// ============================================================
// EXAMPLE 4: Check Order Status
// ============================================================

async function checkOrderStatus(orderId) {
  try {
    console.log(`\nChecking status for order ${orderId}...`);
    const orderDetail = await moogoldAdapter.getOrderDetail(orderId);

    console.log(`Order Status: ${orderDetail.status}`);
    console.log(`Date Created: ${orderDetail.dateCreated}`);
    console.log(`Total: $${orderDetail.total}`);
    console.log('\nItems:');

    orderDetail.items.forEach((item, index) => {
      console.log(`\n  Item ${index + 1}:`);
      console.log(`    Product: ${item.product}`);
      console.log(`    Quantity: ${item.quantity}`);
      console.log(`    Price: $${item.price}`);
      console.log(`    Player ID: ${item.playerId}`);
      console.log(`    Server ID: ${item.serverId}`);
      
      if (item.voucherCodes && item.voucherCodes.length > 0) {
        console.log(`    Voucher Codes:`);
        item.voucherCodes.forEach(code => {
          console.log(`      - ${code}`);
        });
      }
    });

  } catch (error) {
    console.error('Failed to check order status:', error.message);
  }
}

// ============================================================
// EXAMPLE 5: Check Order by Partner Order ID
// ============================================================

async function checkOrderByPartnerID(partnerOrderId) {
  try {
    console.log(`\nSearching for order with Partner ID: ${partnerOrderId}...`);
    const orderDetail = await moogoldAdapter.getOrderDetailByPartnerOrderId(partnerOrderId);

    console.log(`Found Order ID: ${orderDetail.orderId}`);
    console.log(`Status: ${orderDetail.status}`);
    console.log(`Total: $${orderDetail.total}`);

  } catch (error) {
    console.error('Order lookup failed:', error.message);
  }
}

// ============================================================
// EXAMPLE 6: View Transaction History
// ============================================================

async function viewTransactionHistory() {
  try {
    // Get transactions from last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const formatDate = (date) => date.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`\nFetching transactions from ${formatDate(startDate)} to ${formatDate(endDate)}...`);

    const history = await moogoldAdapter.getTransactionHistory({
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      status: 'completed', // Optional filter
      limit: 50
    });

    console.log(`\nTotal orders: ${history.orders.length}`);
    console.log(`Page: ${history.page} of ${Math.ceil(history.orders.length / history.limit)}`);

    history.orders.forEach((order, index) => {
      console.log(`\n${index + 1}. Order #${order.orderId}`);
      console.log(`   Date: ${order.dateCreated}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Total: ${order.total} ${order.currency}`);
      if (order.items && order.items.length > 0) {
        console.log(`   Items: ${order.items.length}`);
      }
    });

  } catch (error) {
    console.error('Failed to fetch transaction history:', error.message);
  }
}

// ============================================================
// EXAMPLE 7: Error Handling
// ============================================================

async function handleErrors() {
  try {
    // This will fail with insufficient balance error
    await moogoldAdapter.createOrder({
      category: 1,
      productId: 215570,
      quantity: 100, // Invalid - max 10
      userId: '12314123',
      serverId: '3402'
    });
  } catch (error) {
    console.error('Error Code:', error.status);
    console.error('Error Message:', error.message);
    
    // Parse error code from message
    const errorCodeMatch = error.message.match(/\((\d+)\)/);
    if (errorCodeMatch) {
      const errorCode = errorCodeMatch[1];
      
      switch (errorCode) {
        case '111':
          console.log('Action: Check wallet balance and reload');
          break;
        case '113':
          console.log('Action: Verify product ID');
          break;
        case '116':
          console.log('Action: Maximum 10 items per order');
          break;
        case '420':
          console.log('Action: Generate new partner order ID');
          break;
        case '422':
          console.log('Action: Verify product is authorized for your account');
          break;
        default:
          console.log('Action: Refer to MooGold API documentation');
      }
    }
  }
}

// ============================================================
// EXAMPLE 8: Integration with Express Controller
// ============================================================

async function expressControllerExample(req, res) {
  try {
    const { playerId, productVariationId, serverId } = req.body;

    // Validate input
    if (!playerId || !productVariationId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Create order
    const order = await moogoldAdapter.createOrder({
      category: 1,
      productId: productVariationId,
      quantity: 1,
      userId: playerId,
      serverId: serverId || null,
      partnerOrderId: `ORDER-${req.user.id}-${Date.now()}`
    });

    // Save order to database
    // await Order.create({ ...order });

    res.json({
      success: true,
      orderId: order.orderId,
      message: 'Order created successfully'
    });

  } catch (error) {
    console.error('Order creation failed:', error.message);
    res.status(error.status || 500).json({
      success: false,
      message: error.message
    });
  }
}

// ============================================================
// MAIN - Uncomment to test
// ============================================================

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('MooGold Adapter - Usage Examples');
    console.log('='.repeat(60));

    // Uncomment to run examples:
    
    // await checkWalletAndReload();
     await browseProducts();
    // const orderId = await createOrderWorkflow();
    // if (orderId) await checkOrderStatus(orderId);
    // await viewTransactionHistory();
    // await handleErrors();

    console.log('\n' + '='.repeat(60));
    console.log('Examples completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Uncomment to run:
 main().catch(console.error);

module.exports = {
  checkWalletAndReload,
  browseProducts,
  createOrderWorkflow,
  checkOrderStatus,
  checkOrderByPartnerID,
  viewTransactionHistory,
  handleErrors,
  expressControllerExample
};
