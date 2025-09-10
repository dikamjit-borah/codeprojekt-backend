const config = require("config");
const mongoConfig = config.get("mongo");
const connectionString = `${mongoConfig.uri}/${mongoConfig.dbName}?${mongoConfig.options}`;
const { MongoClient } = require("mongodb");
const logger = require("../utils/logger");

class MongoDB {
  constructor() {
    this.connectionString = connectionString;
    this.client = new MongoClient(this.connectionString);
    this.db = null;
  }

  async connect() {
    if (!this.db) {
      try {
        await this.client.connect();
        this.db = this.client.db();
        logger.info("MongoDB connected");
      } catch (error) {
        logger.error(
          "Failed to connect to MongoDB",
          { error: error.message, stack: error.stack },
        );
      }
    }
    return this.db;
  }

  async getCollection(name) {
    const db = await this.connect();
    return db.collection(name);
  }

  // General Methods
  async find(collection, query = {}, options = {}) {
    const col = await this.getCollection(collection);
    return col.find(query, options).toArray();
  }

  async findOne(collection, query = {}, options = {}) {
    const col = await this.getCollection(collection);
    return col.findOne(query, options);
  }

  async insertOne(collection, data) {
    const col = await this.getCollection(collection);
    const now = new Date();
    const docWithTimestamps = {
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      ...data,
    };
    return col.insertOne(docWithTimestamps);
  }

  async insertMany(collection, dataArray) {
    const col = await this.getCollection(collection);
    const now = new Date();
    const docsWithTimestamps = dataArray.map((doc) => ({
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || now,
      ...doc,
    }));
    return col.insertMany(docsWithTimestamps);
  }

  async updateOne(collection, filter, update, options = {}) {
    const col = await this.getCollection(collection);
    const now = new Date();
    const isOperatorUpdate = update && Object.keys(update).some((k) => k.startsWith("$"));

    if (isOperatorUpdate) {
      const withUpdatedAt = {
        ...update,
        $set: { ...(update.$set || {}), updatedAt: now },
        $setOnInsert: { ...(update.$setOnInsert || {}), createdAt: now },
      };
      return col.updateOne(filter, withUpdatedAt, { ...options, upsert: true });
    }

    // Replacement document style update
    const replacement = {
      createdAt: update.createdAt || now,
      ...update,
      updatedAt: now,
    };
    return col.updateOne(filter, replacement, { ...options, upsert: true });
  }

  async updateMany(collection, filter, update, options = {}) {
    const col = await this.getCollection(collection);
    const now = new Date();
    const isOperatorUpdate = update && Object.keys(update).some((k) => k.startsWith("$"));

    if (isOperatorUpdate) {
      const withUpdatedAt = {
        ...update,
        $set: { ...(update.$set || {}), updatedAt: now },
        $setOnInsert: { ...(update.$setOnInsert || {}), createdAt: now },
      };
      return col.updateMany(filter, withUpdatedAt, options);
    }

    // Replacement document style update
    const replacement = {
      createdAt: update.createdAt || now,
      ...update,
      updatedAt: now,
    };
    return col.updateMany(filter, replacement, options);
  }

  async deleteOne(collection, filter) {
    const col = await this.getCollection(collection);
    return col.deleteOne(filter);
  }

  async deleteMany(collection, filter) {
    const col = await this.getCollection(collection);
    return col.deleteMany(filter);
  }

  async aggregate(collection, pipeline, options = {}) {
    const col = await this.getCollection(collection);
    return col.aggregate(pipeline, options).toArray();
  }
}

module.exports = new MongoDB();
