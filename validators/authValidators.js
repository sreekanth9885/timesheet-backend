const { body } = require("express-validator");

exports.loginRules = [
  body("email")
    .isEmail()
    .withMessage("Valid email is required")
    .normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

exports.registerOrgRules = [
  body("company_name")
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage("Company name must be 2–200 characters"),
  body("contact_person")
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage("Contact person name is required"),
  body("email")
    .isEmail()
    .withMessage("Valid email is required")
    .normalizeEmail(),
  body("mobile").optional({ checkFalsy: true }).isLength({ max: 20 }),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
];
