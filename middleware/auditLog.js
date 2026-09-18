const pool = require('../config/database');

const auditLog = async (req, action, entityType, entityId, oldValues = null, newValues = null) => {
    try {
        const userId = req.user ? req.user.id : null;
        const ipAddress = req.ip || req.connection.remoteAddress;

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, action, entityType, entityId, JSON.stringify(oldValues), JSON.stringify(newValues), ipAddress]
        );
    } catch (error) {
        console.error('Audit Log Error:', error);
    }
};

module.exports = auditLog;
