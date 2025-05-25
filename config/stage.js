module.exports = {
  smileone: {
    baseURL: process.env.SMILEONE_BASE_URL,
    uid: process.env.SMILEONE_UID,
    email: process.env.SMILEONE_EMAIL,
    secretKey: process.env.SMILEONE_SECRET_KEY,
  },
  brazilianRealToINR: parseFloat(process.env.BRAZILIAN_REAL_TO_INR),
};
