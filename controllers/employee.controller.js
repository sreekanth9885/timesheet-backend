const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const auditLog = require('../middleware/auditLog');

exports.getAll = async (req, res, next) => {
    try {
        let { page = 1, limit = 10, search = '', department_id, status } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        let query = `
            SELECT u.id, u.employee_id, u.first_name, u.last_name, u.email, u.mobile, u.status, u.designation, d.name as department_name, r.name as role_name 
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE 1=1
        `;
        const queryParams = [];

        if (search) {
            query += ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (department_id) {
            query += ` AND u.department_id = ?`;
            queryParams.push(department_id);
        }
        if (status) {
            query += ` AND u.status = ?`;
            queryParams.push(status);
        }

        const countQuery = `SELECT COUNT(*) as total FROM (${query}) as sub`;
        const [countResult] = await pool.query(countQuery, queryParams);
        const total = countResult[0].total;

        query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
        queryParams.push(limit, offset);

        const [employees] = await pool.query(query, queryParams);
        res.json({ success: true, data: employees, pagination: { total, page, limit, totalPages: Math.ceil(total/limit) } });
    } catch (error) { next(error); }
};

exports.getById = async (req, res, next) => {
    try {
        const [users] = await pool.query(`
            SELECT u.*, d.name as department_name, r.name as role_name 
            FROM users u LEFT JOIN departments d ON u.department_id = d.id LEFT JOIN roles r ON u.role_id = r.id 
            WHERE u.id = ?`, [req.params.id]);
        if (!users.length) return res.status(404).json({ success: false, message: 'Employee not found' });
        delete users[0].password;
        res.json({ success: true, data: users[0] });
    } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
    try {
        const { employee_id, first_name, last_name, email, password, mobile, department_id, designation, role_id } = req.body;
        
        const [existing] = await pool.query("SELECT id FROM users WHERE email = ? OR employee_id = ?", [email, employee_id]);
        if (existing.length) return res.status(400).json({ success: false, message: 'Email or Employee ID already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            "INSERT INTO users (employee_id, first_name, last_name, email, password, mobile, department_id, designation, role_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [employee_id, first_name, last_name, email, hashedPassword, mobile, department_id, designation, role_id]
        );
        
        await auditLog(req, 'CREATE', 'USER', result.insertId, null, { employee_id, email });
        res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
    try {
        const { first_name, last_name, mobile, department_id, designation, role_id } = req.body;
        await pool.query(
            "UPDATE users SET first_name=?, last_name=?, mobile=?, department_id=?, designation=?, role_id=? WHERE id=?",
            [first_name, last_name, mobile, department_id, designation, role_id, req.params.id]
        );
        await auditLog(req, 'UPDATE', 'USER', req.params.id, null, req.body);
        res.json({ success: true, message: 'Employee updated' });
    } catch (error) { next(error); }
};

exports.updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        await pool.query("UPDATE users SET status=? WHERE id=?", [status, req.params.id]);
        await auditLog(req, 'UPDATE_STATUS', 'USER', req.params.id, null, { status });
        res.json({ success: true, message: 'Status updated' });
    } catch (error) { next(error); }
};

exports.delete = async (req, res, next) => {
    try {
        // Soft delete
        await pool.query("UPDATE users SET status='terminated' WHERE id = ?", [req.params.id]);
        await auditLog(req, 'DELETE', 'USER', req.params.id, null, { status: 'terminated' });
        res.json({ success: true, message: 'Employee terminated' });
    } catch (error) { next(error); }
};
