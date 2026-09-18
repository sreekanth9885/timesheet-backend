const express = require('express');
const router = express.Router();
const projectController = require('../controllers/project.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', projectController.getAll);
router.get('/:id', projectController.getById);
router.post('/', roleCheck([1, 2]), projectController.create);
router.put('/:id', roleCheck([1, 2]), projectController.update);
router.put('/:id/status', roleCheck([1, 2]), projectController.updateStatus);
router.delete('/:id', roleCheck([1, 2]), projectController.delete);

// Employee project allocation routes
router.get('/:id/employees', projectController.getEmployees);
router.post('/:id/employees', roleCheck([1, 2]), projectController.allocateEmployee);
router.delete('/:id/employees/:employeeId', roleCheck([1, 2]), projectController.deallocateEmployee);

module.exports = router;
