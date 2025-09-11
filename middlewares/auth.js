const admin = require("firebase-admin");
const logger = require("../utils/logger");
const { WHITELISTED_PATHS } = require("../utils/constants");

let isFirebaseInitialized = false;

function initializeFirebaseOnce() {
  if (isFirebaseInitialized) return;

  try {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (rawJson) {
      const serviceAccount = JSON.parse(rawJson);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      isFirebaseInitialized = true;
      logger.info("Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON");
      return;
    }

    // Last fallback: default application credentials if available
    admin.initializeApp();
    isFirebaseInitialized = true;
    logger.info("Firebase Admin initialized with application default credentials");
  } catch (error) {
    isFirebaseInitialized = false;
    logger.error(`Failed initializing Firebase Admin: ${error.message}`);
    throw error;
  }
}

function isWhitelistedPath(originalUrl) {
  if (!originalUrl) return false;
  return WHITELISTED_PATHS.some((prefix) => originalUrl.startsWith(prefix));
}

async function applyAuth(req, res, next) {
  try {
    if (isWhitelistedPath(req.originalUrl)) {
      return next();
    }

    initializeFirebaseOnce();

    const authorizationHeader = req.headers["authorization"] || req.headers["Authorization"];
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      return res.status(401).json({ status: 401, message: "Missing or invalid Authorization header" });
    }

    const idToken = authorizationHeader.substring("Bearer ".length).trim();
    if (!idToken) {
      return res.status(401).json({ status: 401, message: "Invalid Bearer token" });
    }

    const decoded = await admin.auth().verifyIdToken(idToken, true);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified,
      phoneNumber: decoded.phone_number,
      name: decoded.name,
      picture: decoded.picture,
      firebase: decoded.firebase,
      claims: decoded,
    };
    return next();
  } catch (error) {
    logger.error(`Auth error: ${error.message}`);
    return res.status(401).json({ status: 401, message: "Unauthorized" });
  }
}

module.exports = applyAuth;


