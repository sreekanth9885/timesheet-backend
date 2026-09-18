const express = require('express');
const router = express.Router();
const overtimeController = require('../controllers/overtime.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const upload = require('../middleware/upload');

router.use(auth);

router.get('/', overtimeController.getAll);
router.get('/:id', overtimeController.getById);
router.post('/', upload.single('proof'), overtimeController.create);
router.delete('/:id', overtimeController.delete);

// Admin approval endpoints
router.post('/:id/approve', roleCheck([1, 2]), overtimeController.approve);
router.post('/:id/reject', roleCheck([1, 2]), overtimeController.reject);

module.exports = router;

