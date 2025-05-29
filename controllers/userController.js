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

module.exports = {
  fetchPlayerIGN,
};
