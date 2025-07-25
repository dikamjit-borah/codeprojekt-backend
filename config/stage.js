module.exports = {
  env: "stage",
  smileOne: {
    baseURL: process.env.SMILEONE_BASE_URL,
    uid: process.env.SMILEONE_UID,
    email: process.env.SMILEONE_EMAIL,
    secretKey: process.env.SMILEONE_SECRET_KEY,
  },
  brazilianRealToINR: parseFloat(process.env.BRAZILIAN_REAL_TO_INR),
  brazilianRealToSmilecoin: parseFloat(process.env.BRAZILIAN_REAL_TO_SMILECOIN),
  mongo: {
    uri: process.env.MONGO_URI,
    dbName: process.env.MONGO_DB_NAME,
    options: process.env.MONGO_URI_OPTIONS,
  },
  phonePe: {
    clientId: process.env.TEST_PHONEPE_CLIENT_ID,
    clientSecret: process.env.TEST_PHONEPE_CLIENT_SECRET,
    clientVersion: process.env.TEST_PHONEPE_CLIENT_VERSION,
    redirectUrl: process.env.TEST_PHONEPE_REDIRECT_URL,
  },
};
