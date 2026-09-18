const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

exports.getAll = async (req, res, next) => {
    try {
        const [departments] = await pool.query(`
            SELECT d.*, COUNT(u.id) as employee_count 
            FROM departments d 
            LEFT JOIN users u ON d.id = u.department_id AND u.status != 'terminated'
            GROUP BY d.id
            ORDER BY d.name
        `);
        res.json({ success: true, data: departments });
    } catch (error) { next(error); }
};

exports.getById = async (req, res, next) => {
    try {
        const [departments] = await pool.query("SELECT * FROM departments WHERE id = ?", [req.params.id]);
        if (!departments.length) return res.status(404).json({ success: false, message: 'Department not found' });
        res.json({ success: true, data: departments[0] });
    } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
    try {
        const { name, description, status } = req.body;
        const [existing] = await pool.query("SELECT id FROM departments WHERE name = ?", [name]);
        if (existing.length) return res.status(400).json({ success: false, message: 'Department name already exists' });

        const [result] = await pool.query(
            "INSERT INTO departments (name, description, status) VALUES (?, ?, ?)",
            [name, description, status || 'active']
        );
        await auditLog(req, 'CREATE', 'DEPARTMENT', result.insertId, null, req.body);
        res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
    try {
        const { name, description, status } = req.body;
        await pool.query(
            "UPDATE departments SET name=?, description=?, status=? WHERE id=?",
            [name, description, status, req.params.id]
        );
        await auditLog(req, 'UPDATE', 'DEPARTMENT', req.params.id, null, req.body);
        res.json({ success: true, message: 'Department updated' });
    } catch (error) { next(error); }
};

exports.delete = async (req, res, next) => {
    try {
        const [users] = await pool.query("SELECT id FROM users WHERE department_id = ?", [req.params.id]);
        if (users.length > 0) return res.status(400).json({ success: false, message: 'Cannot delete department with active employees' });

        await pool.query("DELETE FROM departments WHERE id = ?", [req.params.id]);
        await auditLog(req, 'DELETE', 'DEPARTMENT', req.params.id, null, null);
        res.json({ success: true, message: 'Department deleted' });
    } catch (error) { next(error); }
};
