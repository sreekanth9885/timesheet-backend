const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

exports.getAll = async (req, res, next) => {
    try {
        let query = `
            SELECT o.*, u.first_name, u.last_name, u.employee_id as emp_code 
            FROM overtime_requests o
            JOIN users u ON o.employee_id = u.id
        `;
        const params = [];

        if (req.user.role_id === 3) {
            query += " WHERE o.employee_id = ?";
            params.push(req.user.id);
        }
        query += " ORDER BY o.created_at DESC";

        const [requests] = await pool.query(query, params);
        res.json({ success: true, data: requests });
    } catch (error) { next(error); }
};

exports.getById = async (req, res, next) => {
    try {
        const [requests] = await pool.query(`
            SELECT o.*, u.first_name, u.last_name 
            FROM overtime_requests o JOIN users u ON o.employee_id = u.id 
            WHERE o.id = ?`, [req.params.id]);
        res.json({ success: true, data: requests[0] });
    } catch (error) { next(error); }
};

exports.approve = async (req, res, next) => {
    try {
        await pool.query(
            "UPDATE overtime_requests SET status='approved', reviewed_by=?, reviewed_at=NOW(), remarks=? WHERE id=?",
            [req.user.id, req.body.remarks || '', req.params.id]
        );
        
        // Also update timesheet is_overtime flag just in case
        const [ovt] = await pool.query("SELECT timesheet_entry_id FROM overtime_requests WHERE id = ?", [req.params.id]);
        if (ovt.length && ovt[0].timesheet_entry_id) {
            await pool.query("UPDATE timesheet_entries SET is_overtime=true WHERE id=?", [ovt[0].timesheet_entry_id]);
        }

        await auditLog(req, 'APPROVE', 'OVERTIME', req.params.id, null, { remarks: req.body.remarks });
        res.json({ success: true, message: 'Overtime approved' });
    } catch (error) { next(error); }
};

exports.reject = async (req, res, next) => {
    try {
        await pool.query(
            "UPDATE overtime_requests SET status='rejected', reviewed_by=?, reviewed_at=NOW(), remarks=? WHERE id=?",
            [req.user.id, req.body.remarks || '', req.params.id]
        );
        await auditLog(req, 'REJECT', 'OVERTIME', req.params.id, null, { remarks: req.body.remarks });
        res.json({ success: true, message: 'Overtime rejected' });
    } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
    try {
        const { date, extra_hours, reason, timesheet_entry_id } = req.body;
        const employee_id = req.user.id;
        const proof_file = req.file ? req.file.filename : null;

        const [result] = await pool.query(
            "INSERT INTO overtime_requests (employee_id, timesheet_entry_id, date, extra_hours, reason, proof_file) VALUES (?, ?, ?, ?, ?, ?)",
            [employee_id, timesheet_entry_id || null, date, extra_hours, reason, proof_file]
        );

        if (req.file) {
            await pool.query(
                "INSERT INTO proofs (entity_type, entity_id, file_name, file_path, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ['overtime', result.insertId, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, employee_id]
            );
        }

        await auditLog(req, 'CREATE', 'OVERTIME', result.insertId, null, { date, extra_hours, reason });
        res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Overtime request submitted successfully' });
    } catch (error) {
        next(error);
    }
};

exports.update = async (req, res, next) => res.json({ success: true });
exports.delete = async (req, res, next) => {
    try {
        await pool.query("DELETE FROM overtime_requests WHERE id = ? AND employee_id = ? AND status = 'pending'", [req.params.id, req.user.id]);
        await auditLog(req, 'DELETE', 'OVERTIME', req.params.id);
        res.json({ success: true, message: 'Overtime request deleted' });
    } catch (error) {
        next(error);
    }
};

