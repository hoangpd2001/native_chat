const { colors: t } = require("./lib/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // theme.js のキー (camelCase) を Tailwind class 名 (kebab-case + foreground 接頭) に変換
      colors: {
        background: t.background,
        foreground: t.foreground,
        card: t.card,
        "card-foreground": t.cardForeground,
        primary: t.primary,
        "primary-foreground": t.primaryForeground,
        muted: t.muted,
        "muted-foreground": t.mutedForeground,
        destructive: t.destructive,
        "destructive-foreground": t.destructiveForeground,
        success: t.success,
        border: t.border,
      },
    },
  },
  plugins: [],
};
