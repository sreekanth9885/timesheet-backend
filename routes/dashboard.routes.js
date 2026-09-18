const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', dashboardController.getAll);
router.get('/:id', dashboardController.getById);
router.post('/', roleCheck([1, 2]), dashboardController.create);
router.put('/:id', roleCheck([1, 2]), dashboardController.update);
router.delete('/:id', roleCheck([1, 2]), dashboardController.delete);

module.exports = router;
