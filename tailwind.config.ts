import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080b16",
        panel: "#111827",
        // Palette colours (see the [data-palette] blocks in globals.css).
        cyan: "rgb(var(--p-accent) / <alpha-value>)",
        gold: "rgb(var(--p-highlight) / <alpha-value>)",
        gold2: "rgb(var(--p-highlight-2) / <alpha-value>)",
        live: "#ff3b5c",
      },
      fontFamily: {
        sans: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Montserrat", "\"Arial Narrow\"", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: { glow: "0 0 40px rgb(var(--p-glow-a) / .18)" },
    },
  },
  plugins: [],
} satisfies Config;
