const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

exports.getAll = async (req, res, next) => {
    try {
        const [settings] = await pool.query("SELECT * FROM settings");
        res.json({ success: true, data: settings });
    } catch (error) { next(error); }
};

exports.getByKey = async (req, res, next) => {
    try {
        const [settings] = await pool.query("SELECT * FROM settings WHERE setting_key = ?", [req.params.id]);
        if (!settings.length) return res.status(404).json({ success: false, message: 'Setting not found' });
        res.json({ success: true, data: settings[0] });
    } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
    try {
        const { setting_value, description } = req.body;
        await pool.query(
            "UPDATE settings SET setting_value=?, description=? WHERE setting_key=?",
            [setting_value, description, req.params.id]
        );
        await auditLog(req, 'UPDATE', 'SETTING', null, null, { key: req.params.id, value: setting_value });
        res.json({ success: true, message: 'Setting updated' });
    } catch (error) { next(error); }
};

// Boilerplate
exports.getById = async (req, res, next) => { this.getByKey(req, res, next); };
exports.create = async (req, res, next) => res.json({ success: true });
exports.delete = async (req, res, next) => res.json({ success: true });
