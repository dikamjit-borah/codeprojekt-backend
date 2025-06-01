const createHttpError = require("http-errors");
const smileoneAdapter = require("../vendors/smileone.adapter");
const mongo = require("../utils/mongo");

const fetchPlayerIGN = async (userid, zoneid) => {
  const playerProfile = await smileoneAdapter.fetchPlayerIGN(userid, zoneid);
  if (!playerProfile || !playerProfile.username) {
    throw createHttpError(404, "Player profile not found");
  }
  return playerProfile;
};

const googleSignInAndFetchProfile = async (googleUserInfo) => {
  const uid = googleUserInfo?.user?.uid;
  if (!uid) throw createHttpError(400, "Invalid user information");

  const existingUser = await mongo.findOne(
    "users",
    { uid },
    { projection: { _id: 1, uid: 1, profile: 1, wallet: 1 } }
  );
  if (existingUser) return { inserted: false, data: existingUser };

  const userProfile = {
    uid,
    profile: {
      name: googleUserInfo.user.displayName || "",
      email: googleUserInfo.user.email || "",
      photoURL: googleUserInfo.user.photoURL || "",
    },
    wallet: { balance: 0 },
  };

  await mongo.insertOne("users", { ...userProfile, googleUserInfo });
  return { inserted: true, data: userProfile };
};

async function fetchUserData(uid) {
  const pipeline = [
    {
      $match: { uid }, // Filter by uid in users collection
    },
    {
      $lookup: {
        from: "transactions", // join with transactions
        localField: "uid", // field from 'users' collection
        foreignField: "uid", // field from 'transactions' collection
        as: "transactions",
      },
    },
    // No $unwind — keep all transactions in an array
    // No $project — include all fields
  ];

  const result = await mongo.aggregate("users", pipeline);
  if (!result || result.length === 0) {
    throw createHttpError(404, "User data not found");
  }
  return result[0];
}

module.exports = {
  fetchPlayerIGN,
  googleSignInAndFetchProfile,
  fetchUserData,
};
