import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "prefer-const": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agent/**",
    ".codex_tmp/**",
    ".cursor/**",
    ".playwright-mcp/**",
    "python-service/.venv/**",
    "**/__pycache__/**",
    "tmp/**",
    "tmp_*",
    "tmp_*/**",
    "scripts/**",
    "src/scripts/**",
    "eslint_output.json",
    "eslint.json",
    "diagnose_data.ts",
    "fix*.js",
    "inspect_*.js",
    "list-users.js",
    "patch*.js",
    "test_db.js",
  ]),
]);

export default eslintConfig;
