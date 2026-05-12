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
      colors: {
        background: "#0b0f1a",
        foreground: "#f0f1f4",
        card: "#161b27",
        "card-foreground": "#f0f1f4",
        primary: "#4d8cff",
        "primary-foreground": "#f7f8fa",
        muted: "#1f242f",
        "muted-foreground": "#7d8390",
        border: "rgba(255,255,255,0.08)",
        destructive: "#e84545",
        "destructive-foreground": "#ffffff",
      },
    },
  },
  plugins: [],
};
