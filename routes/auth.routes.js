const router = require("express").Router();
const authCtrl = require("../controllers/authController");
const orgCtrl = require("../controllers/organizationController");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  loginRules,
  registerOrgRules,
} = require("../validators/authValidators");

router.post("/login", loginRules, validate, authCtrl.login);
router.post(
  "/register-organization",
  registerOrgRules,
  validate,
  orgCtrl.register,
);

router.post("/logout", auth, authCtrl.logout);
router.get("/me", auth, authCtrl.getMe);
router.put("/change-password", auth, authCtrl.changePassword);
router.put("/profile", auth, authCtrl.updateProfile);

module.exports = router;
