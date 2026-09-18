const express = require('express');
const router = express.Router();
const timesheetController = require('../controllers/timesheet.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', roleCheck([1, 2]), timesheetController.getAll);
router.get('/my/today', timesheetController.getMyToday);
router.get('/my/week', timesheetController.getMyWeek);
router.get('/my/month', timesheetController.getMyMonth);
router.get('/my/history', timesheetController.getMyHistory);
router.get('/:id', timesheetController.getById);
router.post('/', timesheetController.create);
router.put('/:id', timesheetController.update);
router.delete('/:id', timesheetController.delete);
router.post('/:id/submit', timesheetController.submit);

module.exports = router;
