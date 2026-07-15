import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default [
  { ignores: [".next/**", "node_modules/**"] },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@next/next": nextPlugin },
    rules: nextPlugin.configs.recommended.rules,
  },
];
