const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.get("/playerIGN", userController.fetchPlayerIGN);

module.exports = router;
