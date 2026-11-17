import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#080b16", panel: "#111827", cyan: "#39d6ff", gold: "#ffca5f", live: "#ff3b5c" },
      fontFamily: {
        sans: ["\"Plus Jakarta Sans\"", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["\"Barlow Condensed\"", "\"Arial Narrow\"", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: { glow: "0 0 40px rgba(57,214,255,.18)" },
    },
  },
  plugins: [],
} satisfies Config;
