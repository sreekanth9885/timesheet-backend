const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/employees', roleCheck([1, 2]), reportController.getEmployeeReport);
router.get('/projects', roleCheck([1, 2]), reportController.getProjectReport);
router.get('/tasks', roleCheck([1, 2]), reportController.getTaskReport);
router.get('/overtime', roleCheck([1, 2]), reportController.getOvertimeReport);
router.get('/departments', roleCheck([1, 2]), reportController.getDepartmentReport);

module.exports = router;
