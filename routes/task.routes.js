const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', taskController.getAll);
router.get('/my', taskController.getMyTasks);
router.get('/:id', taskController.getById);
router.post('/', taskController.create);
router.put('/:id', roleCheck([1, 2]), taskController.update);
router.put('/:id/status', taskController.updateStatus);
router.put('/:id/hours', roleCheck([1, 2]), taskController.allocateHours);
router.delete('/:id', roleCheck([1, 2]), taskController.delete);

module.exports = router;
