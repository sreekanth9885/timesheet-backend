const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', employeeController.getAll);
router.get('/:id', employeeController.getById);
router.post('/', roleCheck([1, 2]), employeeController.create);
router.put('/:id', roleCheck([1, 2]), employeeController.update);
router.put('/:id/status', roleCheck([1, 2]), employeeController.updateStatus);
router.delete('/:id', roleCheck([1, 2]), employeeController.delete);

module.exports = router;
