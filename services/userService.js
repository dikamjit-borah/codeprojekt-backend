const createHttpError = require("http-errors");
const smileoneAdapter = require("../vendors/smileone.adapter");
const fetchPlayerIGN = async (userid, zoneid) => {
  const result = await smileoneAdapter.fetchPlayerIGN(userid, zoneid);
  if (!result || !result.username) {
    throw createHttpError(404, "Player profile not found");
  }
  return result;
};

module.exports = {
  fetchPlayerIGN,
};
