const createHttpError = require("http-errors");
const smileOneAdapter = require("../vendors/smileOne.adapter");
const mongo = require("../providers/mongo");

const fetchPlayerIGN = async (userid, zoneid) => {
  const playerProfile = await smileOneAdapter.fetchPlayerIGN(userid, zoneid);
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
        foreignField: "userDetails.uid", // field from 'transactions' collection
        as: "transactions",
      },
    },
    {
      $addFields: {
        transactions: {
          $sortArray: {
            input: "$transactions",
            sortBy: { createdAt: -1 } // Sort by createdAt descending (latest first)
          }
        }
      }
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

const fetchAllUsers = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const pipeline = [
    {
      $project: {
        profile: 1,
      },
    },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const result = await mongo.aggregate("users", pipeline);
  if (!result || result.length === 0) {
    return {
      data: [],
      pagination: {
        page,
        limit,
        total: 0,
        pages: 0,
      },
    };
  }

  const { metadata, data } = result[0];
  const total = metadata.length > 0 ? metadata[0].total : 0;
  const pages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages,
    },
  };
};

module.exports = {
  fetchPlayerIGN,
  googleSignInAndFetchProfile,
  fetchUserData,
  fetchAllUsers,
};
