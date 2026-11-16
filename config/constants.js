const ROLES = { SUPER_ADMIN: 1, ORG_ADMIN: 2, EMPLOYEE: 3 };

const ORG_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
  PENDING: "pending",
  REJECTED: "rejected",
};

module.exports = { ROLES, ORG_STATUS };
