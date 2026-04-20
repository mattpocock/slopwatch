export default {
  "*.{ts,tsx}": ["prettier --write", () => "bun run typecheck"],
  "*.{js,mjs,cjs,json,md,yml,yaml}": "prettier --write",
};
