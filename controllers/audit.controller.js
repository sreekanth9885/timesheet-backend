const pool = require('../config/database');

exports.getAll = async (req, res, next) => {
    try {
        let { page = 1, limit = 20, action, entity_type, user_id, start_date, end_date } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        let query = `
            SELECT a.*, u.first_name, u.last_name, u.email 
            FROM audit_logs a 
            LEFT JOIN users u ON a.user_id = u.id 
            WHERE 1=1
        `;
        const params = [];

        if (action) { query += " AND a.action = ?"; params.push(action); }
        if (entity_type) { query += " AND a.entity_type = ?"; params.push(entity_type); }
        if (user_id) { query += " AND a.user_id = ?"; params.push(user_id); }
        if (start_date && end_date) { 
            query += " AND DATE(a.created_at) BETWEEN ? AND ?"; 
            params.push(start_date, end_date); 
        }

        const countQuery = `SELECT COUNT(*) as total FROM (${query}) as sub`;
        const [countResult] = await pool.query(countQuery, params);
        const total = countResult[0].total;

        query += " ORDER BY a.created_at DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const [logs] = await pool.query(query, params);
        res.json({ success: true, data: logs, pagination: { total, page, limit, totalPages: Math.ceil(total/limit) } });
    } catch (error) { next(error); }
};

// Boilerplate
exports.getById = async (req, res, next) => {
    try {
        const [logs] = await pool.query("SELECT * FROM audit_logs WHERE id = ?", [req.params.id]);
        res.json({ success: true, data: logs[0] });
    } catch (error) { next(error); }
};
exports.create = async (req, res, next) => res.json({ success: true });
exports.update = async (req, res, next) => res.json({ success: true });
exports.delete = async (req, res, next) => res.json({ success: true });
