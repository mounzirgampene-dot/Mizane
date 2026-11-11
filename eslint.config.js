import globals from "globals";

export default [
  {
    files: ["js/**/*.js", "tests/**/*.mjs", "sw.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-const-assign": "error",
      "eqeqeq": ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
