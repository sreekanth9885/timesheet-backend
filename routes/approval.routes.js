const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approval.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', roleCheck([1, 2]), approvalController.getPending);
router.post('/approve', roleCheck([1, 2]), approvalController.approve);
router.post('/reject', roleCheck([1, 2]), approvalController.reject);

module.exports = router;
