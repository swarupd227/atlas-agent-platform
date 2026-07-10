// Targeted accessibility lint (UX audit F-4).
// Deliberately narrow: this is an a11y guard, not a general style linter —
// the codebase predates linting and a full ruleset would produce an
// unactionable wall. Extend incrementally once this baseline is clean.
import jsxA11y from "eslint-plugin-jsx-a11y";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["client/src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/no-noninteractive-tabindex": "warn",
      // Icon-only buttons must carry an accessible name — screen readers
      // announce nothing otherwise (96% failed this at audit time).
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='Button']:has(JSXAttribute[name.name='size'][value.value='icon']):not(:has(JSXAttribute[name.name='aria-label'])):not(:has(JSXAttribute[name.name='title']))",
          message:
            'Icon-only <Button size="icon"> needs an aria-label (or title) — screen readers announce nothing otherwise.',
        },
      ],
    },
  },
];
