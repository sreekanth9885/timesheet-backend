const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const roleCheck = require("../middleware/roleCheck");
const controller = require("../controllers/organizationController");

router.use(auth);

// Platform Super Admin only
router.get("/", roleCheck([1]), controller.listAll);
router.post("/", roleCheck([1]), controller.register);
router.put("/:id/status", roleCheck([1]), controller.approve);

module.exports = router;
