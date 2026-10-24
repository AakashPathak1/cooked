import type { Config } from "tailwindcss";

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        sunk: token("sunk"),
        ink: token("ink"),
        mute: token("mute"),
        line: token("line"),
        brand: token("brand"),
        "brand-ink": token("brand-ink"),
        "brand-soft": token("brand-soft"),
        danger: token("danger"),
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: { tightest: "-0.035em" },
      keyframes: {
        "sheet-up": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        like: {
          "0%": { transform: "scale(1)" },
          "35%": { transform: "scale(1.35)" },
          "100%": { transform: "scale(1)" },
        },
        shimmer: { to: { backgroundPosition: "-200% 0" } },
      },
      animation: {
        "sheet-up": "sheet-up 280ms cubic-bezier(0.32, 0.72, 0, 1)",
        "pop-in": "pop-in 160ms ease-out",
        fade: "fade 160ms ease-out",
        "toast-in": "toast-in 180ms ease-out",
        like: "like 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
