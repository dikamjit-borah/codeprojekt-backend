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

module.exports = {
  fetchPlayerIGN,
  googleSignInAndFetchProfile,
};
