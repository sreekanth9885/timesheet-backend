const fs = require('fs');
const path = require('path');

const resources = [
    'employee', 'department', 'project', 'task', 
    'overtime', 'approval', 'report', 'dashboard', 'settings', 'audit'
];

resources.forEach(res => {
    // Controller
    const controllerContent = `const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

exports.getAll = async (req, res, next) => {
    try {
        res.json({ success: true, message: 'Get all ${res}s endpoint' });
    } catch (error) { next(error); }
};

exports.getById = async (req, res, next) => {
    try {
        res.json({ success: true, message: 'Get ${res} by id endpoint' });
    } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
    try {
        res.json({ success: true, message: 'Create ${res} endpoint' });
    } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
    try {
        res.json({ success: true, message: 'Update ${res} endpoint' });
    } catch (error) { next(error); }
};

exports.delete = async (req, res, next) => {
    try {
        res.json({ success: true, message: 'Delete ${res} endpoint' });
    } catch (error) { next(error); }
};
`;
    fs.writeFileSync(path.join(__dirname, 'controllers', `${res}.controller.js`), controllerContent);

    // Routes
    const routeContent = `const express = require('express');
const router = express.Router();
const ${res}Controller = require('../controllers/${res}.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

router.get('/', ${res}Controller.getAll);
router.get('/:id', ${res}Controller.getById);
router.post('/', roleCheck([1, 2]), ${res}Controller.create);
router.put('/:id', roleCheck([1, 2]), ${res}Controller.update);
router.delete('/:id', roleCheck([1, 2]), ${res}Controller.delete);

module.exports = router;
`;
    fs.writeFileSync(path.join(__dirname, 'routes', `${res}.routes.js`), routeContent);
});

// Update server.js to uncomment the routes
let serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
serverContent = serverContent.replace(/\/\/ const (.*?) = require\((.*?)\);/g, "const $1 = require($2);");
serverContent = serverContent.replace(/\/\/ app\.use\((.*?)\);/g, "app.use($1);");
fs.writeFileSync(path.join(__dirname, 'server.js'), serverContent);

console.log('Scaffolding generated successfully!');
