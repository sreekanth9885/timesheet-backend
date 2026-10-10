const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');
const {
    sendSelectiveEncrypted,
} = require("../utils/projectEncryption");

exports.getAll = async (req, res, next) => {
    try {
        let projects;

        if (Number(req.user.role_id) === 3) {
            [projects] = await pool.query(
                `SELECT p.*
         FROM projects p
         INNER JOIN project_employees pe
           ON p.id = pe.project_id
         WHERE pe.employee_id = ?
         ORDER BY p.created_at DESC`,
                [req.user.id]
            );
      } else {
          [projects] = await pool.query(
              `SELECT *
         FROM projects
         ORDER BY created_at DESC`
          );
      }

        return sendSelectiveEncrypted(req, res, 200, {
            success: true,
            data: projects,
        });
    } catch (error) {
        next(error);
    }
};



exports.getById = async (req, res, next) => {
    try {
      const projectId = Number(req.params.id);

      if (!Number.isInteger(projectId) || projectId <= 0) {
          return res.status(400).json({
              success: false,
              message: "Invalid project ID",
          });
      }

      let projects;

      if (Number(req.user.role_id) === 3) {
          [projects] = await pool.query(
              `SELECT p.*
         FROM projects p
         INNER JOIN project_employees pe
           ON p.id = pe.project_id
         WHERE p.id = ?
           AND pe.employee_id = ?
         LIMIT 1`,
              [projectId, req.user.id]
          );
      } else {
          [projects] = await pool.query(
              `SELECT *
         FROM projects
         WHERE id = ?
         LIMIT 1`,
              [projectId]
          );
      }

      if (projects.length === 0) {
          return res.status(404).json({
              success: false,
              message: "Project not found",
          });
      }

      return sendSelectiveEncrypted(req, res, 200, {
          success: true,
          data: projects[0],
      });
  } catch (error) {
      next(error);
  }
};


exports.create = async (req, res, next) => {
    try {
        const { project_code, name, client_name, description, start_date, end_date, priority, budget_hours, estimated_hours } = req.body;
        const [result] = await pool.query(
            "INSERT INTO projects (project_code, name, client_name, description, start_date, end_date, priority, budget_hours, estimated_hours, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [project_code, name, client_name, description, start_date, end_date, priority, budget_hours, estimated_hours, req.user.id]
        );
        await auditLog(req, 'CREATE', 'PROJECT', result.insertId, null, req.body);
        res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
    try {
        const { name, client_name, description, start_date, end_date, priority, budget_hours, estimated_hours, status } = req.body;
        await pool.query(
            "UPDATE projects SET name=?, client_name=?, description=?, start_date=?, end_date=?, priority=?, budget_hours=?, estimated_hours=?, status=? WHERE id=?",
            [name, client_name, description, start_date, end_date, priority, budget_hours, estimated_hours, status, req.params.id]
        );
        await auditLog(req, 'UPDATE', 'PROJECT', req.params.id, null, req.body);
        res.json({ success: true, message: 'Project updated' });
    } catch (error) { next(error); }
};

exports.updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        await pool.query("UPDATE projects SET status=? WHERE id=?", [status, req.params.id]);
        await auditLog(req, 'UPDATE_STATUS', 'PROJECT', req.params.id, null, { status });
        res.json({ success: true, message: 'Project status updated' });
    } catch (error) { next(error); }
};

exports.delete = async (req, res, next) => {
    try {
        await pool.query("DELETE FROM projects WHERE id = ?", [req.params.id]);
        await auditLog(req, 'DELETE', 'PROJECT', req.params.id, null, null);
        res.json({ success: true, message: 'Project deleted' });
    } catch (error) { next(error); }
};

exports.getEmployees = async (req, res, next) => {
    try {
        const [employees] = await pool.query(`
            SELECT u.id, u.first_name, u.last_name, u.email, pe.allocation_percentage, pe.start_date, pe.end_date 
            FROM project_employees pe
            JOIN users u ON pe.employee_id = u.id
            WHERE pe.project_id = ?
        `, [req.params.id]);
        res.json({ success: true, data: employees });
    } catch (error) { next(error); }
};

exports.allocateEmployee = async (req, res, next) => {
    try {
        const { employee_id, allocation_percentage, start_date, end_date } = req.body;
        await pool.query(
            "INSERT INTO project_employees (project_id, employee_id, allocation_percentage, start_date, end_date) VALUES (?, ?, ?, ?, ?)",
            [req.params.id, employee_id, allocation_percentage || 100, start_date, end_date]
        );
        await auditLog(req, 'ALLOCATE', 'PROJECT', req.params.id, null, req.body);
        res.json({ success: true, message: 'Employee allocated to project' });
    } catch (error) { next(error); }
};

exports.deallocateEmployee = async (req, res, next) => {
    try {
        await pool.query("DELETE FROM project_employees WHERE project_id = ? AND employee_id = ?", [req.params.id, req.params.employeeId]);
        await auditLog(req, 'DEALLOCATE', 'PROJECT', req.params.id, null, { employeeId: req.params.employeeId });
        res.json({ success: true, message: 'Employee deallocated' });
    } catch (error) { next(error); }
};
