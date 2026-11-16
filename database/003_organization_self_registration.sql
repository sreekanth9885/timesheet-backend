-- 1. Extend status enum on organizations
ALTER TABLE organizations
MODIFY COLUMN status ENUM('active','inactive','suspended','pending','rejected')
    DEFAULT 'pending';

-- 2. Add registration fields
ALTER TABLE organizations
    ADD COLUMN contact_person   VARCHAR(150) NULL AFTER name,
    ADD COLUMN rejection_reason TEXT         NULL AFTER status;

-- 3. Ensure the three platform roles exist (global IDs, matching existing code convention)
INSERT IGNORE INTO roles (id, name, description, organization_id)
-- VALUES (1, 'Super Admin',        'Platform super administrator', 1),
--        (2, 'Organization Admin', 'Organization administrator',   1),
--        (3, 'Employee',           'Regular employee',             1);

-- 4. Ensure the platform "Default Organization" (id=1) is active (needed for super-admin login)
-- UPDATE organizations SET status = 'active' WHERE id = 1;