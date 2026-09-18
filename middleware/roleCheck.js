const roleCheck = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }
        
        // Ensure roles is an array
        const allowedRoles = Array.isArray(roles) ? roles : [roles];
        
        // Roles: 1 = Super Admin, 2 = Admin, 3 = Employee
        // We will pass an array of allowed role IDs
        if (!allowedRoles.includes(req.user.role_id)) {
            return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
        }
        
        next();
    };
};

module.exports = roleCheck;
