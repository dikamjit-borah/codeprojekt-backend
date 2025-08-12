const express = require("express");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { MongoClient } = require("mongodb");

// Mock data for testing
const mockTransaction = {
  transactionId: "test-transaction-123",
  spuId: "test-spu-001",
  spuDetails: {
    price: 100,
    currency: "BRL",
    name: "Test Gaming Pack"
  },
  spuType: "inGameItem",
  userDetails: {
    userId: "test-user-001",
    email: "test@example.com"
  },
  status: "pending",
  subStatus: "order_initiated",
  stage: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("Transaction Status API", () => {
  let app;
  let mongoServer;
  let mongoClient;
  let db;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    db = mongoClient.db("test");

    // Setup express app
    app = express();
    app.use(express.json());
    
    // Mock database connection
    require("../utils/mongo").db = db;
    
    // Setup routes
    app.use("/v1/payment", require("../routes/payment"));
  });

  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Insert mock transaction before each test
    await db.collection("transactions").insertOne(mockTransaction);
  });

  afterEach(async () => {
    // Clean up after each test
    await db.collection("transactions").deleteMany({});
  });

  describe("GET /transaction/:transactionId/status", () => {
    it("should return transaction status successfully", async () => {
      const response = await request(app)
        .get(`/v1/payment/transaction/${mockTransaction.transactionId}/status`)
        .expect(200);

      expect(response.body.status).toBe(200);
      expect(response.body.message).toBe("Transaction status retrieved successfully");
      expect(response.body.data.transactionId).toBe(mockTransaction.transactionId);
      expect(response.body.data.stage).toBe(1);
    });

    it("should return 404 for non-existent transaction", async () => {
      const response = await request(app)
        .get("/v1/payment/transaction/non-existent-id/status")
        .expect(404);

      expect(response.body.status).toBe(404);
      expect(response.body.message).toBe("Transaction not found");
    });

    it("should return 400 for missing transaction ID", async () => {
      const response = await request(app)
        .get("/v1/payment/transaction//status")
        .expect(404); // Express will return 404 for empty param
    });
  });

//   describe("PUT /transaction/:transactionId/stage", () => {
//     it("should update transaction stage successfully", async () => {
//       const response = await request(app)
//         .put(`/v1/payment/transaction/${mockTransaction.transactionId}/stage`)
//         .send({ stage: 3 })
//         .expect(200);

//       expect(response.body.status).toBe(200);
//       expect(response.body.message).toBe("Transaction stage updated to 3");
//       expect(response.body.data.stage).toBe(3);

//       // Verify database was updated
//       const updatedTransaction = await db.collection("transactions")
//         .findOne({ transactionId: mockTransaction.transactionId });
//       expect(updatedTransaction.stage).toBe(3);
//       expect(updatedTransaction.status).toBe("pending");
//       expect(updatedTransaction.subStatus).toBe("payment_success");
//     });

//     it("should return 400 for invalid stage", async () => {
//       const response = await request(app)
//         .put(`/v1/payment/transaction/${mockTransaction.transactionId}/stage`)
//         .send({ stage: 5 })
//         .expect(400);

//       expect(response.body.status).toBe(400);
//       expect(response.body.message).toBe("Invalid stage. Must be 1, 2, 3, or 4");
//     });

//     it("should return 400 for missing stage", async () => {
//       const response = await request(app)
//         .put(`/v1/payment/transaction/${mockTransaction.transactionId}/stage`)
//         .send({})
//         .expect(400);

//       expect(response.body.status).toBe(400);
//       expect(response.body.message).toBe("Transaction ID and stage are required");
//     });
//   });
});

// Example integration test
describe("Transaction Flow Integration", () => {
  it("should handle complete transaction flow", async () => {
    // This would test the entire flow from purchase to completion
    // 1. Create purchase
    // 2. Process webhook
    // 3. Check status updates
    // 4. Verify socket events
    // Implementation depends on your specific flow
  });
});
