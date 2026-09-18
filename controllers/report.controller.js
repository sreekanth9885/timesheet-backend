const pool = require('../config/database');

exports.getEmployeeReport = async (req, res, next) => {
    try {
        const { start_date, end_date } = req.query;
        let query = `
            SELECT t.employee_id, u.first_name, u.last_name, 
                   SUM(t.total_hours) as total_hours, 
                   COUNT(t.id) as entries_count 
            FROM timesheet_entries t 
            JOIN users u ON t.employee_id = u.id 
            WHERE 1=1
        `;
        const params = [];
        if (start_date && end_date) {
            query += " AND t.date BETWEEN ? AND ?";
            params.push(start_date, end_date);
        }
        query += " GROUP BY t.employee_id, u.first_name, u.last_name ORDER BY total_hours DESC";
        
        const [report] = await pool.query(query, params);
        res.json({ success: true, data: report });
    } catch (error) { next(error); }
};

exports.getProjectReport = async (req, res, next) => {
    try {
        const [report] = await pool.query(`
            SELECT p.id, p.name, p.budget_hours, p.estimated_hours, 
                   IFNULL(SUM(t.total_hours), 0) as actual_hours,
                   (IFNULL(SUM(t.total_hours), 0) / NULLIF(p.budget_hours, 0)) * 100 as budget_utilization_percent
            FROM projects p 
            LEFT JOIN timesheet_entries t ON p.id = t.project_id AND t.status = 'approved'
            GROUP BY p.id, p.name, p.budget_hours, p.estimated_hours
        `);
        res.json({ success: true, data: report });
    } catch (error) { next(error); }
};

exports.getTaskReport = async (req, res, next) => {
    try {
        const [report] = await pool.query(`
            SELECT t.status, COUNT(t.id) as task_count, SUM(t.estimated_hours) as total_estimated, SUM(t.actual_hours) as total_actual
            FROM tasks t
            GROUP BY t.status
        `);
        res.json({ success: true, data: report });
    } catch (error) { next(error); }
};

exports.getOvertimeReport = async (req, res, next) => {
    try {
        const [report] = await pool.query(`
            SELECT u.first_name, u.last_name, SUM(o.extra_hours) as total_overtime, COUNT(o.id) as request_count
            FROM overtime_requests o
            JOIN users u ON o.employee_id = u.id
            WHERE o.status = 'approved'
            GROUP BY o.employee_id, u.first_name, u.last_name
        `);
        res.json({ success: true, data: report });
    } catch (error) { next(error); }
};

exports.getDepartmentReport = async (req, res, next) => {
    try {
        const [report] = await pool.query(`
            SELECT d.name, COUNT(DISTINCT u.id) as employee_count, IFNULL(SUM(t.total_hours), 0) as total_hours
            FROM departments d
            LEFT JOIN users u ON d.id = u.department_id
            LEFT JOIN timesheet_entries t ON u.id = t.employee_id
            GROUP BY d.id, d.name
        `);
        res.json({ success: true, data: report });
    } catch (error) { next(error); }
};

// Boilerplate
exports.getAll = async (req, res, next) => res.json({ success: true, message: 'Use specific report endpoints' });
exports.getById = async (req, res, next) => res.json({ success: true });
exports.create = async (req, res, next) => res.json({ success: true });
exports.update = async (req, res, next) => res.json({ success: true });
exports.delete = async (req, res, next) => res.json({ success: true });
