-- 1. Create organizations table

CREATE TABLE IF NOT EXISTS organizations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) NOT NULL,
    email VARCHAR(150) NULL,
    phone VARCHAR(20) NULL,
    logo VARCHAR(255) NULL,
    status ENUM('active','inactive','suspended')
        DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_org_code (code)
);

-- 2. Create default organization for existing data

INSERT IGNORE INTO organizations (id, name, code)
VALUES (1, 'Default Organization', 'DEFAULT');

-- 3. Add organization_id to existing tables

ALTER TABLE users
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE departments
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE roles
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE settings
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE projects
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE tasks
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE project_employees
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE timesheet_entries
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE overtime_requests
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE approvals
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE proofs
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

ALTER TABLE audit_logs
ADD COLUMN organization_id INT NOT NULL DEFAULT 1;

-- 4. Add indexes

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_departments_org ON departments(organization_id);
CREATE INDEX idx_roles_org ON roles(organization_id);
CREATE INDEX idx_settings_org ON settings(organization_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_tasks_org ON tasks(organization_id);
CREATE INDEX idx_project_employees_org ON project_employees(organization_id);
CREATE INDEX idx_timesheet_org ON timesheet_entries(organization_id);
CREATE INDEX idx_overtime_org ON overtime_requests(organization_id);
CREATE INDEX idx_approvals_org ON approvals(organization_id);
CREATE INDEX idx_proofs_org ON proofs(organization_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);

-- 5. Add organization foreign keys

ALTER TABLE users
ADD CONSTRAINT fk_users_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE departments
ADD CONSTRAINT fk_departments_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE roles
ADD CONSTRAINT fk_roles_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE settings
ADD CONSTRAINT fk_settings_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE projects
ADD CONSTRAINT fk_projects_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE tasks
ADD CONSTRAINT fk_tasks_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE project_employees
ADD CONSTRAINT fk_project_employees_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE timesheet_entries
ADD CONSTRAINT fk_timesheet_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE overtime_requests
ADD CONSTRAINT fk_overtime_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE approvals
ADD CONSTRAINT fk_approvals_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE proofs
ADD CONSTRAINT fk_proofs_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE audit_logs
ADD CONSTRAINT fk_audit_logs_org
FOREIGN KEY (organization_id) REFERENCES organizations(id);