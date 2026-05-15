import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "data/**",
      "uploads/**",
      "landing/dist/**",
      ".claude/**",
      ".codex-artifacts/**",
      ".codex-tmp/**",
      "claude-design-pack/**",
    ],
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        React: "readonly",
        ReactDOM: "readonly",
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        localStorage: "readonly",
        CustomEvent: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-redeclare": "off"
    }
  }
];
