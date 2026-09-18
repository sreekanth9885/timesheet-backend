-- Roles
INSERT INTO roles (name, description) VALUES
('Super Admin', 'Has access to all modules and system settings'),
('Admin', 'Can manage employees, projects, and approvals'),
('Employee', 'Can submit timesheets and manage assigned tasks');

-- Settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
('working_hours_per_day', '8', 'Standard working hours per day'),
('max_hours_per_day', '16', 'Maximum hours an employee can log per day'),
('overtime_threshold', '8', 'Hours after which overtime is considered');

-- Departments
INSERT INTO departments (name, description) VALUES
('Development', 'Software development and engineering'),
('QA', 'Quality assurance and testing'),
('HR', 'Human resources'),
('Sales', 'Sales and marketing');

-- Users
-- Password for all users is 'password123' hashed with bcrypt (salt rounds 10)
-- $2b$10$6lbOeKBX9XB2JoKwq8wCbuSGKkqJ5UoYZruknaLQRbWieGfhjKTZ2 -> password123
INSERT INTO users (employee_id, first_name, last_name, email, password, mobile, department_id, designation, role_id) VALUES
('EMP001', 'Super', 'Admin', 'superadmin@example.com', '$2b$10$6lbOeKBX9XB2JoKwq8wCbuSGKkqJ5UoYZruknaLQRbWieGfhjKTZ2', '1234567890', NULL, 'System Admin', 1),
('EMP002', 'Admin', 'User1', 'admin1@example.com', '$2b$10$6lbOeKBX9XB2JoKwq8wCbuSGKkqJ5UoYZruknaLQRbWieGfhjKTZ2', '1234567891', 3, 'HR Manager', 2),
('EMP003', 'Admin', 'User2', 'admin2@example.com', '$2b$10$6lbOeKBX9XB2JoKwq8wCbuSGKkqJ5UoYZruknaLQRbWieGfhjKTZ2', '1234567892', 4, 'Sales Head', 2),
('EMP004', 'John', 'Doe', 'john@example.com', '$2b$10$6lbOeKBX9XB2JoKwq8wCbuSGKkqJ5UoYZruknaLQRbWieGfhjKTZ2', '1234567893', 1, 'Senior Developer', 3),
('EMP005', 'Jane', 'Smith', 'jane@example.com', '$2b$10$6lbOeKBX9XB2JoKwq8wCbuSGKkqJ5UoYZruknaLQRbWieGfhjKTZ2', '1234567894', 1, 'Junior Developer', 3),
('EMP006', 'Bob', 'Johnson', 'bob@example.com', '$2b$10$6lbOeKBX9XB2JoKwq8wCbuSGKkqJ5UoYZruknaLQRbWieGfhjKTZ2', '1234567895', 2, 'QA Engineer', 3),
('EMP007', 'Alice', 'Brown', 'alice@example.com', '$2b$10$6lbOeKBX9XB2JoKwq8wCbuSGKkqJ5UoYZruknaLQRbWieGfhjKTZ2', '1234567896', 1, 'UI/UX Designer', 3),
('EMP008', 'Charlie', 'Davis', 'charlie@example.com', '$2b$10$6lbOeKBX9XB2JoKwq8wCbuSGKkqJ5UoYZruknaLQRbWieGfhjKTZ2', '1234567897', 2, 'Automation Tester', 3);

-- Projects
INSERT INTO projects (project_code, name, client_name, description, start_date, end_date, status, created_by) VALUES
('PRJ-001', 'Timesheet System', 'Internal', 'Internal timesheet tracking software', '2026-01-01', '2026-12-31', 'active', 1),
('PRJ-002', 'E-commerce App', 'Acme Corp', 'Mobile app for e-commerce client', '2026-02-01', '2026-08-31', 'active', 2),
('PRJ-003', 'ERP Migration', 'Globex', 'Migration of legacy ERP to cloud', '2026-05-01', '2026-10-31', 'on_hold', 2);

-- Tasks
INSERT INTO tasks (name, description, project_id, assigned_to, created_by, estimated_hours) VALUES
('Database Design', 'Design schema for MVP', 1, 4, 1, 40),
('API Development', 'Build REST endpoints', 1, 5, 1, 80),
('Frontend Setup', 'Setup React project', 1, 7, 1, 20),
('App Testing', 'QA testing for sprint 1', 2, 6, 2, 40);
