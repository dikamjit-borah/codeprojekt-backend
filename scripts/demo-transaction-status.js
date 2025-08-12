#!/usr/bin/env node

/**
 * Demo script to test the Transaction Status API
 * Run with: node scripts/demo-transaction-status.js
 */

const axios = require('axios');
const { io } = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const DEMO_TRANSACTION_ID = 'exk029jf2j3d02';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAPI() {
  console.log('🚀 Starting Transaction Status API Demo\n');

  try {
    // Test 1: Get transaction status
    console.log('📊 Testing GET transaction status...');
    try {
      const response = await axios.get(`${API_BASE_URL}/v1/payment/transaction/${DEMO_TRANSACTION_ID}/status`);
      console.log('✅ Status retrieved:', {
        stage: response.data.data.stage,
        status: response.data.data.status,
        subStatus: response.data.data.subStatus
      });
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('❓ Transaction not found (expected for demo)');
      } else {
        console.log('❌ Error:', error.message);
      }
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: Update transaction stages
    console.log('🔄 Testing stage updates...');
    for (let stage = 1; stage <= 4; stage++) {
      try {
        const response = await axios.put(`${API_BASE_URL}/v1/payment/transaction/${DEMO_TRANSACTION_ID}/stage`, {
          stage: stage
        });
        console.log(`✅ Stage ${stage} updated:`, response.data.message);
        await delay(1000); // Wait 1 second between updates
      } catch (error) {
        console.log(`❌ Failed to update stage ${stage}:`, error.response?.data?.message || error.message);
      }
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 3: Invalid requests
    console.log('⚠️  Testing error handling...');
    
    // Test invalid stage
    try {
      await axios.put(`${API_BASE_URL}/v1/payment/transaction/${DEMO_TRANSACTION_ID}/stage`, {
        stage: 5
      });
    } catch (error) {
      console.log('✅ Invalid stage rejected:', error.response.data.message);
    }

    // Test missing transaction
    try {
      await axios.get(`${API_BASE_URL}/v1/payment/transaction/non-existent/status`);
    } catch (error) {
      console.log('✅ Non-existent transaction handled:', error.response.data.message);
    }

  } catch (error) {
    console.log('❌ API Test failed:', error.message);
  }
}

async function testWebSocket() {
  console.log('\n🔌 Testing WebSocket connection...');

  const socket = io(API_BASE_URL, {
    transports: ['websocket', 'polling']
  });

  return new Promise((resolve) => {
    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);

      // Subscribe to transaction updates
      socket.emit('subscribe-transaction', DEMO_TRANSACTION_ID);
      console.log('📡 Subscribed to transaction:', DEMO_TRANSACTION_ID);

      // Listen for updates
      socket.on('transaction-stage', (payload) => {
        console.log('📨 Received stage update:', payload);
      });

      socket.on('transaction-update', (payload) => {
        console.log('📨 Received transaction update:', payload);
      });

      // Test by updating stage via API
      setTimeout(async () => {
        console.log('\n🔄 Triggering stage update to test socket...');
        try {
          await axios.put(`${API_BASE_URL}/v1/payment/transaction/${DEMO_TRANSACTION_ID}/stage`, {
            stage: 3
          });
        } catch (error) {
          console.log('❌ Failed to trigger update:', error.message);
        }

        // Cleanup and resolve
        setTimeout(() => {
          socket.emit('unsubscribe-transaction', DEMO_TRANSACTION_ID);
          socket.disconnect();
          console.log('🔌 Socket disconnected\n');
          resolve();
        }, 2000);
      }, 1000);
    });

    socket.on('connect_error', (error) => {
      console.log('❌ Socket connection failed:', error.message);
      resolve();
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
    });
  });
}

async function main() {
  console.log('Transaction Status API Demo');
  console.log('API URL:', API_BASE_URL);
  console.log('Demo Transaction ID:', DEMO_TRANSACTION_ID);
  console.log('\n' + '='.repeat(50));

  // Run API tests
  await testAPI();

  // Run WebSocket tests
  await testWebSocket();

  console.log('🎉 Demo completed!');
  console.log('\nNext steps:');
  console.log('1. Install socket.io: npm install socket.io');
  console.log('2. Start the server: npm run stage-unix');
  console.log('3. Open your frontend transaction status page');
  console.log('4. Test with transaction ID:', DEMO_TRANSACTION_ID);

  process.exit(0);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.log('❌ Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.log('❌ Unhandled rejection:', error.message);
  process.exit(1);
});

// Run the demo
main();
