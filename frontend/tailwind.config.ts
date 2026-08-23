import type { Config } from "tailwindcss";

// Design system: warm cream canvas (#f5f3ed) + white surfaces, a #3D6FBE blue
// accent, deep navy ink for text. Single-hue blue tonal for the brand mark /
// primary buttons — deliberately not a multi-hue "AI" gradient (see
// docs/decisions.md). Kept in sync with .claude/skills/design-system and
// docs/rules/design-system.md.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep-navy scale (text, headers, dark surfaces).
        navy: {
          50: "#eef1f6",
          100: "#d9e0ec",
          200: "#a7b5cf",
          300: "#7b90b7",
          400: "#5a719c",
          500: "#3a4f78",
          600: "#22345a",
          700: "#132542",
          800: "#0a172c",
          900: "#06152b", // primary anchor
        },
        canvas: "#f5f3ed", // warm paper cream
        surface: "#ffffff",
        accent: "#3D6FBE", // brand blue — links, focus, active
        "accent-dark": "#335ea3",
        "accent-soft": "#e9eff7", // light blue tint (reads on cream + white)
        // Relevance band semantics (SourcePanel trust affordance, D10).
        relevance: {
          strong: "#15803d",
          medium: "#b45309",
          weak: "#b91c1c",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      backgroundImage: {
        // Single-hue blue tonal (brand mark, primary buttons, hero) — deliberately
        // not a multi-hue "AI" gradient.
        brand: "linear-gradient(135deg, #4c7cc6 0%, #3D6FBE 55%, #335ea3 100%)",
        "brand-soft":
          "linear-gradient(135deg, rgba(61,111,190,0.10) 0%, rgba(61,111,190,0.03) 100%)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28, 33, 41, 0.04), 0 2px 8px rgba(28, 33, 41, 0.06)",
        lift: "0 6px 24px -8px rgba(28, 33, 41, 0.16)",
        glow: "0 8px 26px -8px rgba(61, 111, 190, 0.30)",
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.28s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
