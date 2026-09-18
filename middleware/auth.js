const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader) {
            return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        }

        const token = authHeader.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, message: 'Access denied. Invalid token format.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role_id, employee_id, ... }
        next();
    } catch (ex) {
        res.status(400).json({ success: false, message: 'Invalid token.' });
    }
};

module.exports = auth;
