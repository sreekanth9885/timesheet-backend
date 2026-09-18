const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', auditController.getAll);
router.get('/:id', auditController.getById);
router.post('/', roleCheck([1, 2]), auditController.create);
router.put('/:id', roleCheck([1, 2]), auditController.update);
router.delete('/:id', roleCheck([1, 2]), auditController.delete);

module.exports = router;
