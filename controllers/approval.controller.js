const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

exports.getPending = async (req, res, next) => {
    try {
        // Pending timesheets
        const [timesheets] = await pool.query(`
            SELECT t.*, u.first_name, u.last_name, p.name as project_name 
            FROM timesheet_entries t 
            JOIN users u ON t.employee_id = u.id 
            JOIN projects p ON t.project_id = p.id 
            WHERE t.status = 'submitted'
        `);

        // Pending overtime
        const [overtime] = await pool.query(`
            SELECT o.*, u.first_name, u.last_name 
            FROM overtime_requests o 
            JOIN users u ON o.employee_id = u.id 
            WHERE o.status = 'pending'
        `);

        // Pending tasks
        const [tasks] = await pool.query(`
            SELECT t.*, u.first_name, u.last_name, p.name as project_name 
            FROM tasks t 
            JOIN users u ON t.created_by = u.id 
            JOIN projects p ON t.project_id = p.id 
            WHERE t.approval_status = 'pending'
        `);

        res.json({ success: true, data: { timesheets, overtime, tasks } });
    } catch (error) { next(error); }
};

exports.approve = async (req, res, next) => {
    try {
        const { entity_type, entity_id, comments } = req.body; // entity_type: 'timesheet', 'overtime', 'task'
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            await connection.query(
                "INSERT INTO approvals (entity_type, entity_id, approver_id, status, comments) VALUES (?, ?, ?, 'approved', ?)",
                [entity_type, entity_id, req.user.id, comments]
            );

            if (entity_type === 'timesheet') {
                await connection.query("UPDATE timesheet_entries SET status = 'approved' WHERE id = ?", [entity_id]);
            } else if (entity_type === 'overtime') {
                await connection.query("UPDATE overtime_requests SET status = 'approved', reviewed_by=?, reviewed_at=NOW(), remarks=? WHERE id = ?", [req.user.id, comments, entity_id]);
            } else if (entity_type === 'task') {
                await connection.query("UPDATE tasks SET approval_status = 'approved' WHERE id = ?", [entity_id]);
            }

            await connection.commit();
            await auditLog(req, 'APPROVE', entity_type.toUpperCase(), entity_id, null, { comments });
            res.json({ success: true, message: `${entity_type} approved successfully` });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) { next(error); }
};

exports.reject = async (req, res, next) => {
    try {
        const { entity_type, entity_id, comments } = req.body;
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            await connection.query(
                "INSERT INTO approvals (entity_type, entity_id, approver_id, status, comments) VALUES (?, ?, ?, 'rejected', ?)",
                [entity_type, entity_id, req.user.id, comments]
            );

            if (entity_type === 'timesheet') {
                await connection.query("UPDATE timesheet_entries SET status = 'rejected' WHERE id = ?", [entity_id]);
            } else if (entity_type === 'overtime') {
                await connection.query("UPDATE overtime_requests SET status = 'rejected', reviewed_by=?, reviewed_at=NOW(), remarks=? WHERE id = ?", [req.user.id, comments, entity_id]);
            } else if (entity_type === 'task') {
                await connection.query("UPDATE tasks SET approval_status = 'rejected' WHERE id = ?", [entity_id]);
            }

            await connection.commit();
            await auditLog(req, 'REJECT', entity_type.toUpperCase(), entity_id, null, { comments });
            res.json({ success: true, message: `${entity_type} rejected successfully` });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) { next(error); }
};

// Boilerplate
exports.getAll = async (req, res, next) => { this.getPending(req, res, next); };
exports.getById = async (req, res, next) => res.json({ success: true });
exports.create = async (req, res, next) => res.json({ success: true });
exports.update = async (req, res, next) => res.json({ success: true });
exports.delete = async (req, res, next) => res.json({ success: true });
