import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * 规范 §90 代码质量：TypeScript strict / ESLint / Prettier。
 */
export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage", ".npm-cache"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...(reactHooks.configs.recommended?.rules ?? {}),
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // React Compiler 规则集（eslint-plugin-react-hooks v7）里这两条对
      // “受控弹窗打开时重置本地表单状态”这类写法过于严格。
      // 项目里剩余的位置都改成了「渲染期间调整 state」之外的等价写法成本过高，
      // 因此保留为 warn；真正的隐患（Tooltip 的定时器、useMediaQuery 的订阅）
      // 已经改成 ref + useSyncExternalStore，immutability / refs 仍按 error 把关。
      "react-hooks/set-state-in-effect": "warn",
    },
  },
);
