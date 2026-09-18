const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

// 1. When submitting timesheet: check total hours for that day don't exceed max_hours_per_day setting
// 2. Check for time overlap with existing entries on same day
// 3. Cannot submit to closed/cancelled projects
// 4. Cannot edit entries with status 'approved'
// 5. Auto-flag entries as overtime when daily total exceeds overtime_threshold setting

exports.create = async (req, res, next) => {
    try {
        const { date, project_id, task_id, start_time, end_time, break_minutes, description, work_summary } = req.body;
        const employee_id = req.user.id;

        // Fetch settings
        const [settings] = await pool.query("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('max_hours_per_day', 'overtime_threshold')");
        const maxHours = parseFloat(settings.find(s => s.setting_key === 'max_hours_per_day')?.setting_value || 16);
        const overtimeThreshold = parseFloat(settings.find(s => s.setting_key === 'overtime_threshold')?.setting_value || 8);

        // Project validation
        const [projects] = await pool.query("SELECT status FROM projects WHERE id = ?", [project_id]);
        if (!projects.length || ['completed', 'cancelled', 'on_hold'].includes(projects[0].status)) {
            return res.status(400).json({ success: false, message: 'Cannot log time to inactive/closed project' });
        }

        // Project assignment validation
        const [assignments] = await pool.query("SELECT * FROM project_employees WHERE project_id = ? AND employee_id = ?", [project_id, employee_id]);
        if (!assignments.length && req.user.role_id === 3) {
            return res.status(403).json({ success: false, message: 'You are not assigned to this project' });
        }

        // Calculate hours
        const start = new Date(`1970-01-01T${start_time}Z`);
        const end = new Date(`1970-01-01T${end_time}Z`);
        let diffHours = (end - start) / (1000 * 60 * 60);
        if (diffHours < 0) diffHours += 24; // Cross midnight
        const total_hours = diffHours - (break_minutes || 0) / 60;

        if (total_hours <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid time range' });
        }

        // Overlap validation
        const [overlaps] = await pool.query(
            `SELECT id FROM timesheet_entries 
             WHERE employee_id = ? AND date = ? AND 
             ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))`,
            [employee_id, date, start_time, start_time, end_time, end_time]
        );
        if (overlaps.length > 0) {
            return res.status(400).json({ success: false, message: 'Time entry overlaps with an existing entry' });
        }

        // Max hours validation
        const [dailyTotalRow] = await pool.query(
            "SELECT SUM(total_hours) as daily_total FROM timesheet_entries WHERE employee_id = ? AND date = ?", 
            [employee_id, date]
        );
        const daily_total = parseFloat(dailyTotalRow[0].daily_total || 0);
        if (daily_total + total_hours > maxHours) {
            return res.status(400).json({ success: false, message: `Exceeds max allowed hours per day (${maxHours})` });
        }

        // Overtime check
        const is_overtime = (daily_total + total_hours) > overtimeThreshold;

        // Insert
        const [result] = await pool.query(
            `INSERT INTO timesheet_entries (employee_id, date, project_id, task_id, start_time, end_time, break_minutes, total_hours, description, work_summary, is_overtime)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [employee_id, date, project_id, task_id || null, start_time, end_time, break_minutes || 0, total_hours, description, work_summary, is_overtime]
        );

        // Auto-create overtime request if needed
        if (is_overtime) {
            const extra_hours = (daily_total + total_hours) - overtimeThreshold;
            await pool.query(
                `INSERT INTO overtime_requests (employee_id, timesheet_entry_id, date, extra_hours, reason) VALUES (?, ?, ?, ?, ?)`,
                [employee_id, result.insertId, date, extra_hours, 'Auto-generated from timesheet']
            );
        }

        await auditLog(req, 'CREATE', 'TIMESHEET', result.insertId, null, req.body);
        res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Timesheet entry created' });

    } catch (error) {
        next(error);
    }
};

exports.update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { start_time, end_time, break_minutes, description, work_summary } = req.body;
        const employee_id = req.user.id;

        const [entries] = await pool.query("SELECT * FROM timesheet_entries WHERE id = ?", [id]);
        if (!entries.length) return res.status(404).json({ success: false, message: 'Entry not found' });
        const entry = entries[0];

        if (entry.employee_id !== employee_id && req.user.role_id === 3) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (entry.status === 'approved') {
            return res.status(400).json({ success: false, message: 'Cannot edit approved entries' });
        }

        // Calculate new hours
        const start = new Date(`1970-01-01T${start_time}Z`);
        const end = new Date(`1970-01-01T${end_time}Z`);
        let diffHours = (end - start) / (1000 * 60 * 60);
        if (diffHours < 0) diffHours += 24;
        const total_hours = diffHours - (break_minutes || 0) / 60;

        await pool.query(
            `UPDATE timesheet_entries SET start_time=?, end_time=?, break_minutes=?, total_hours=?, description=?, work_summary=? WHERE id=?`,
            [start_time, end_time, break_minutes, total_hours, description, work_summary, id]
        );

        await auditLog(req, 'UPDATE', 'TIMESHEET', id, entry, req.body);
        res.json({ success: true, message: 'Timesheet updated' });

    } catch (error) {
        next(error);
    }
};

exports.submit = async (req, res, next) => {
    try {
        const { id } = req.params;
        const employee_id = req.user.id;

        const [entries] = await pool.query("SELECT * FROM timesheet_entries WHERE id = ?", [id]);
        if (!entries.length) return res.status(404).json({ success: false, message: 'Entry not found' });
        const entry = entries[0];

        if (entry.employee_id !== employee_id && req.user.role_id === 3) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (entry.status !== 'draft') {
            return res.status(400).json({ success: false, message: 'Only draft entries can be submitted' });
        }

        await pool.query("UPDATE timesheet_entries SET status='submitted' WHERE id=?", [id]);
        await auditLog(req, 'SUBMIT', 'TIMESHEET', id, { status: entry.status }, { status: 'submitted' });

        res.json({ success: true, message: 'Timesheet submitted' });

    } catch (error) {
        next(error);
    }
};

exports.delete = async (req, res, next) => {
    try {
        const { id } = req.params;
        const employee_id = req.user.id;

        const [entries] = await pool.query("SELECT * FROM timesheet_entries WHERE id = ?", [id]);
        if (!entries.length) return res.status(404).json({ success: false, message: 'Entry not found' });
        
        if (entries[0].status !== 'draft') {
            return res.status(400).json({ success: false, message: 'Can only delete draft entries' });
        }

        if (entries[0].employee_id !== employee_id && req.user.role_id === 3) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        await pool.query("DELETE FROM timesheet_entries WHERE id = ?", [id]);
        await auditLog(req, 'DELETE', 'TIMESHEET', id, entries[0], null);

        res.json({ success: true, message: 'Timesheet deleted' });

    } catch (error) {
        next(error);
    }
};

exports.getAll = async (req, res, next) => {
    try {
        const [entries] = await pool.query("SELECT * FROM timesheet_entries ORDER BY date DESC, start_time DESC");
        res.json({ success: true, data: entries });
    } catch (error) {
        next(error);
    }
};

exports.getById = async (req, res, next) => {
    try {
        const [entries] = await pool.query("SELECT * FROM timesheet_entries WHERE id = ?", [req.params.id]);
        if (!entries.length) return res.status(404).json({ success: false, message: 'Entry not found' });
        res.json({ success: true, data: entries[0] });
    } catch (error) {
        next(error);
    }
};

exports.getMyToday = async (req, res, next) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const [entries] = await pool.query("SELECT * FROM timesheet_entries WHERE employee_id = ? AND date = ?", [req.user.id, today]);
        res.json({ success: true, data: entries });
    } catch (error) {
        next(error);
    }
};

exports.getMyWeek = async (req, res, next) => {
    try {
        const [entries] = await pool.query(
            "SELECT * FROM timesheet_entries WHERE employee_id = ? AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)", 
            [req.user.id]
        );
        res.json({ success: true, data: entries });
    } catch (error) {
        next(error);
    }
};

exports.getMyMonth = async (req, res, next) => {
    try {
        const [entries] = await pool.query(
            "SELECT * FROM timesheet_entries WHERE employee_id = ? AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())", 
            [req.user.id]
        );
        res.json({ success: true, data: entries });
    } catch (error) {
        next(error);
    }
};

exports.getMyHistory = async (req, res, next) => {
    try {
        const { start_date, end_date } = req.query;
        let query = `
            SELECT t.*, p.name as project_name, tk.name as task_name 
            FROM timesheet_entries t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN tasks tk ON t.task_id = tk.id
            WHERE t.employee_id = ?
        `;
        const params = [req.user.id];

        if (start_date && end_date) {
            query += " AND t.date BETWEEN ? AND ?";
            params.push(start_date, end_date);
        }
        query += " ORDER BY t.date DESC, t.start_time DESC";

        const [entries] = await pool.query(query, params);
        res.json({ success: true, data: entries });
    } catch (error) {
        next(error);
    }
};

