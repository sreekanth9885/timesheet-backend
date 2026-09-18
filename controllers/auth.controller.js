const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND status = "active"', [email]);
        const user = users[0];

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, role_id: user.role_id, employee_id: user.employee_id },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Remove password from response
        delete user.password;

        await auditLog({ user: { id: user.id }, ip: req.ip }, 'LOGIN', 'USER', user.id);

        res.json({
            success: true,
            data: { token, user },
            message: 'Logged in successfully'
        });
    } catch (error) {
        next(error);
    }
};

exports.logout = async (req, res, next) => {
    try {
        // Token invalidation is handled client-side by deleting it
        await auditLog(req, 'LOGOUT', 'USER', req.user.id);
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        next(error);
    }
};

exports.getMe = async (req, res, next) => {
    try {
        const [users] = await pool.query(
            'SELECT u.id, u.employee_id, u.first_name, u.last_name, u.email, u.mobile, u.designation, u.status, u.role_id, r.name as role_name ' +
            'FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?', 
            [req.user.id]
        );

        if (!users.length) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, data: users[0] });
    } catch (error) {
        next(error);
    }
};

exports.changePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Old password and new password are required' });
        }

        const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (!users.length) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(oldPassword, users[0].password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password does not match' });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
        await auditLog(req, 'CHANGE_PASSWORD', 'USER', req.user.id);

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        next(error);
    }
};

exports.updateProfile = async (req, res, next) => {
    try {
        const { mobile, first_name, last_name } = req.body;
        await pool.query(
            'UPDATE users SET mobile = COALESCE(?, mobile), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name) WHERE id = ?',
            [mobile, first_name, last_name, req.user.id]
        );
        await auditLog(req, 'UPDATE_PROFILE', 'USER', req.user.id, null, req.body);

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        next(error);
    }
};

