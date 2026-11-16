const router = require("express").Router();
const auth = require("../middleware/auth");
const superAdmin = require("../middleware/requireSuperAdmin");
const ctrl = require("../controllers/organizationController");

router.use(auth, superAdmin);

router.get("/organizations/pending", ctrl.listPending);
router.get("/organizations", ctrl.listAll);
router.post("/organizations/:id/approve", ctrl.approve);
router.post("/organizations/:id/reject", ctrl.reject);

module.exports = router;
