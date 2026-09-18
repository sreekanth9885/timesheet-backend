const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

exports.getAll = async (req, res, next) => {
    try {
        const { project_id, assigned_to, status, priority } = req.query;
        let query = `
            SELECT t.*, p.name as project_name, u.first_name as assignee_first, u.last_name as assignee_last 
            FROM tasks t
            JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE 1=1
        `;
        const params = [];
        
        if (project_id) { query += " AND t.project_id = ?"; params.push(project_id); }
        if (assigned_to) { query += " AND t.assigned_to = ?"; params.push(assigned_to); }
        if (status) { query += " AND t.status = ?"; params.push(status); }
        if (priority) { query += " AND t.priority = ?"; params.push(priority); }
        
        query += " ORDER BY t.created_at DESC";

        const [tasks] = await pool.query(query, params);
        res.json({ success: true, data: tasks });
    } catch (error) { next(error); }
};

exports.getMyTasks = async (req, res, next) => {
    try {
        const [tasks] = await pool.query(`
            SELECT t.*, p.name as project_name 
            FROM tasks t
            JOIN projects p ON t.project_id = p.id
            WHERE t.assigned_to = ?
            ORDER BY t.created_at DESC
        `, [req.user.id]);
        res.json({ success: true, data: tasks });
    } catch (error) { next(error); }
};


exports.getById = async (req, res, next) => {
    try {
        const [tasks] = await pool.query(`
            SELECT t.*, p.name as project_name, u.first_name as assignee_first, u.last_name as assignee_last 
            FROM tasks t JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.assigned_to = u.id 
            WHERE t.id = ?`, [req.params.id]);
        res.json({ success: true, data: tasks[0] });
    } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
    try {
        const { name, description, project_id, assigned_to, estimated_hours, due_date, priority } = req.body;
        const is_employee_created = req.user.role_id === 3;
        const approval_status = is_employee_created ? 'pending' : 'approved';

        const [result] = await pool.query(
            "INSERT INTO tasks (name, description, project_id, assigned_to, created_by, estimated_hours, priority, due_date, is_employee_created, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [name, description, project_id, assigned_to, req.user.id, estimated_hours, priority, due_date, is_employee_created, approval_status]
        );
        await auditLog(req, 'CREATE', 'TASK', result.insertId, null, req.body);
        res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
    try {
        const { name, description, assigned_to, estimated_hours, due_date, priority } = req.body;
        await pool.query(
            "UPDATE tasks SET name=?, description=?, assigned_to=?, estimated_hours=?, due_date=?, priority=? WHERE id=?",
            [name, description, assigned_to, estimated_hours, due_date, priority, req.params.id]
        );
        await auditLog(req, 'UPDATE', 'TASK', req.params.id, null, req.body);
        res.json({ success: true, message: 'Task updated' });
    } catch (error) { next(error); }
};

exports.updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        await pool.query("UPDATE tasks SET status=? WHERE id=?", [status, req.params.id]);
        await auditLog(req, 'UPDATE_STATUS', 'TASK', req.params.id, null, { status });
        res.json({ success: true, message: 'Task status updated' });
    } catch (error) { next(error); }
};

exports.allocateHours = async (req, res, next) => {
    try {
        const { estimated_hours } = req.body;
        await pool.query("UPDATE tasks SET estimated_hours=? WHERE id=?", [estimated_hours, req.params.id]);
        await auditLog(req, 'ALLOCATE_HOURS', 'TASK', req.params.id, null, { estimated_hours });
        res.json({ success: true, message: 'Hours allocated' });
    } catch (error) { next(error); }
};

exports.delete = async (req, res, next) => {
    try {
        await pool.query("DELETE FROM tasks WHERE id = ?", [req.params.id]);
        await auditLog(req, 'DELETE', 'TASK', req.params.id, null, null);
        res.json({ success: true, message: 'Task deleted' });
    } catch (error) { next(error); }
};
