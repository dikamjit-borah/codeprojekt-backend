const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.get("/playerIGN", userController.fetchPlayerIGN);
router.post("/login/google", userController.googleSignInAndFetchProfile);
router.get("/profile/:uid", userController.fetchUserData);

module.exports = router;
