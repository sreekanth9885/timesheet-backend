const pool = require('../config/database');

exports.getAdmin = async (req, res, next) => {
    try {
        const [empCount] = await pool.query("SELECT COUNT(*) as count FROM users WHERE status = 'active' AND role_id = 3");
        const [projCount] = await pool.query("SELECT COUNT(*) as count FROM projects WHERE status = 'active'");
        
        const [pendingTs] = await pool.query("SELECT COUNT(*) as count FROM timesheet_entries WHERE status = 'submitted'");
        const [pendingOt] = await pool.query("SELECT COUNT(*) as count FROM overtime_requests WHERE status = 'pending'");
        const [pendingTasks] = await pool.query("SELECT COUNT(*) as count FROM tasks WHERE approval_status = 'pending'");
        
        const [todayHours] = await pool.query("SELECT SUM(total_hours) as hours FROM timesheet_entries WHERE date = CURDATE()");
        
        res.json({
            success: true,
            data: {
                totalEmployees: empCount[0].count,
                activeProjects: projCount[0].count,
                pendingApprovals: {
                    timesheets: pendingTs[0].count,
                    overtime: pendingOt[0].count,
                    tasks: pendingTasks[0].count,
                    total: pendingTs[0].count + pendingOt[0].count + pendingTasks[0].count
                },
                todaysTotalHours: todayHours[0].hours || 0
            }
        });
    } catch (error) { next(error); }
};

exports.getEmployee = async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        const [today] = await pool.query("SELECT SUM(total_hours) as hours FROM timesheet_entries WHERE employee_id = ? AND date = CURDATE()", [userId]);
        const [week] = await pool.query("SELECT SUM(total_hours) as hours FROM timesheet_entries WHERE employee_id = ? AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)", [userId]);
        const [month] = await pool.query("SELECT SUM(total_hours) as hours FROM timesheet_entries WHERE employee_id = ? AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())", [userId]);
        
        const [pendingApprovals] = await pool.query("SELECT COUNT(*) as count FROM timesheet_entries WHERE employee_id = ? AND status = 'submitted'", [userId]);
        const [overtimeCount] = await pool.query("SELECT COUNT(*) as count FROM overtime_requests WHERE employee_id = ?", [userId]);
        const [assignedTasks] = await pool.query("SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status != 'completed'", [userId]);

        res.json({
            success: true,
            data: {
                hours: {
                    today: today[0].hours || 0,
                    week: week[0].hours || 0,
                    month: month[0].hours || 0
                },
                pendingApprovals: pendingApprovals[0].count,
                overtimeCount: overtimeCount[0].count,
                activeAssignedTasks: assignedTasks[0].count
            }
        });
    } catch (error) { next(error); }
};

// Boilerplate
exports.getAll = async (req, res, next) => {
    if (req.user.role_id === 3) return this.getEmployee(req, res, next);
    return this.getAdmin(req, res, next);
};
exports.getById = async (req, res, next) => res.json({ success: true });
exports.create = async (req, res, next) => res.json({ success: true });
exports.update = async (req, res, next) => res.json({ success: true });
exports.delete = async (req, res, next) => res.json({ success: true });
