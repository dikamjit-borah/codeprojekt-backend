const config = require("config");
const uri = config.get("mongoDB.uri");
const { MongoClient } = require("mongodb");
const logger = require("./logger");

class MongoDB {
  constructor() {
    this.uri = uri;
    this.client = new MongoClient(this.uri, {
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
    return col.updateOne(filter, update, options);
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
}

module.exports = new MongoDB();
