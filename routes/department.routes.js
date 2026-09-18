const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/department.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', departmentController.getAll);
router.get('/:id', departmentController.getById);
router.post('/', roleCheck([1, 2]), departmentController.create);
router.put('/:id', roleCheck([1, 2]), departmentController.update);
router.delete('/:id', roleCheck([1, 2]), departmentController.delete);

module.exports = router;
