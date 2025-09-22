module.exports = {
  env: "prod",
  smileOne: {
    baseURL: process.env.SMILEONE_BASE_URL,
    uid: process.env.SMILEONE_UID,
    email: process.env.SMILEONE_EMAIL,
    secretKey: process.env.SMILEONE_SECRET_KEY,
  },
  mongo: {
    uri: process.env.MONGO_URI,
    dbName: process.env.MONGO_DB_NAME,
    options: process.env.MONGO_URI_OPTIONS,
  },
  phonePe: {
    clientId: process.env.PHONEPE_CLIENT_ID,
    clientSecret: process.env.PHONEPE_CLIENT_SECRET,
    clientVersion: process.env.PHONEPE_CLIENT_VERSION,
    redirectUrl: process.env.PHONEPE_REDIRECT_URL,
    merchantUsername: process.env.PHONEPE_MERCHANT_USERNAME,
    merchantPassword: process.env.PHONEPE_MERCHANT_PASSWORD,
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: 6379,
    connectTimeout: 3000,
    tls: process.env.REDIS_TLS,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    database: process.env.REDIS_DB || 0,
  }
};
