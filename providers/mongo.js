const config = require("config");
const mongoConfig = config.get("mongo");
const connectionString = `${mongoConfig.uri}/${mongoConfig.dbName}?${mongoConfig.options}`;
const { MongoClient } = require("mongodb");
const logger = require("../utils/logger");

class MongoDB {
  constructor() {
    this.connectionString = connectionString;
    this.client = new MongoClient(this.connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
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
          { error: error.message, stack: error.stack },
          "Failed to connect to MongoDB"
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
    return col.insertOne(data);
  }

  async insertMany(collection, dataArray) {
    const col = await this.getCollection(collection);
    return col.insertMany(dataArray);
  }

  async updateOne(collection, filter, update, options = {}) {
    const col = await this.getCollection(collection);
    return col.updateOne(filter, update, { ...options, upsert: true });
  }

  async updateMany(collection, filter, update, options = {}) {
    const col = await this.getCollection(collection);
    return col.updateMany(filter, update, options);
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
