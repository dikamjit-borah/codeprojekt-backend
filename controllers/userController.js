const userService = require("../services/userService");

const fetchPlayerIGN = async (req, res, next) => {
  try {
    const { userid, zoneid } = req.query;
    const result = await userService.fetchPlayerIGN(userid, zoneid);
    res.success(200, "Player profile fetched", result);
  } catch (error) {
    next(error);
  }
};

const googleSignInAndFetchProfile = async (req, res, next) => {
  try {
    const googleUserInfo = req.body.googleUserInfo;
    const result = await userService.googleSignInAndFetchProfile(
      googleUserInfo
    );
    res.success(result.inserted ? 201 : 200, "User signed in", result.data);
  } catch (error) {
    next(error);
  }
};

const fetchUserData = async (req, res, next) => {
  try {
    const uid = req.params.uid;
    const result = await userService.fetchUserData(uid);
    res.success(200, "User data fetched", result);
  } catch (error) {
    next(error);
  }
};

const fetchAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const result = await userService.fetchAllUsers(page, limit);
    res.success(200, "Users fetched", result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  fetchPlayerIGN,
  googleSignInAndFetchProfile,
  fetchUserData,
  fetchAllUsers,
};
