const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', settingsController.getAll);
router.get('/:id', settingsController.getById);
router.post('/', roleCheck([1, 2]), settingsController.create);
router.put('/:id', roleCheck([1, 2]), settingsController.update);
router.delete('/:id', roleCheck([1, 2]), settingsController.delete);

module.exports = router;
