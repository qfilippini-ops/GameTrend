import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/games/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#dde6ff",
          200: "#c3d1ff",
          300: "#9ab2ff",
          400: "#6b89ff",
          500: "#4460ff",
          600: "#2b3ef5",
          700: "#2330e0",
          800: "#2029b5",
          900: "#20288f",
          950: "#0c1145",
        },
        ghost: {
          50: "#fdf4ff",
          100: "#fae8ff",
          200: "#f5d0fe",
          300: "#f0abfc",
          400: "#e879f9",
          500: "#d946ef",
          600: "#c026d3",
          700: "#a21caf",
          800: "#86198f",
          900: "#701a75",
          950: "#3b0040",
        },
        surface: {
          50: "#f8f9ff",
          100: "#eef0fa",
          200: "#dde1f5",
          300: "#bec4e8",
          400: "#9aa3d6",
          500: "#6872b0",
          600: "#484f8a",
          700: "#2e3360",
          800: "#181c3a",
          900: "#0e1022",
          950: "#06070d",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "'Space Grotesk'", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2.5s ease-in-out infinite alternate",
        "neon-pulse": "neonPulse 3s ease-in-out infinite alternate",
        float: "float 5s ease-in-out infinite",
        "slide-in-right": "slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        // Animation d'apparition des PresetCard (remplace framer-motion sur la
        // landing pour ne pas polluer le bundle critique). Le delay est passé
        // inline via style.animationDelay côté composant.
        "preset-card-in": "presetCardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { transform: "translateY(20px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          from: { transform: "scale(0.9)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        slideInRight: {
          from: { transform: "translateX(20px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        presetCardIn: {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        glow: {
          from: { boxShadow: "0 0 15px rgba(68, 96, 255, 0.3), 0 0 40px rgba(68, 96, 255, 0.05)" },
          to: { boxShadow: "0 0 35px rgba(68, 96, 255, 0.65), 0 0 80px rgba(68, 96, 255, 0.2)" },
        },
        neonPulse: {
          "0%": {
            boxShadow: "0 0 8px rgba(68, 96, 255, 0.3), 0 0 25px rgba(68, 96, 255, 0.05)",
          },
          "100%": {
            boxShadow: "0 0 22px rgba(68, 96, 255, 0.7), 0 0 70px rgba(68, 96, 255, 0.25)",
          },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-brand": "linear-gradient(135deg, #4460ff 0%, #d946ef 100%)",
        "gradient-dark": "linear-gradient(180deg, #06070d 0%, #0e1022 100%)",
        "gradient-neon": "linear-gradient(135deg, #4460ff 0%, #d946ef 60%, #e879f9 100%)",
        "gradient-arcade": "linear-gradient(135deg, #08091a 0%, #0e1022 100%)",
      },
      boxShadow: {
        "neon-brand": "0 0 20px rgba(68, 96, 255, 0.5), 0 0 60px rgba(68, 96, 255, 0.15)",
        "neon-ghost": "0 0 20px rgba(217, 70, 239, 0.5), 0 0 60px rgba(217, 70, 239, 0.15)",
        "neon-red": "0 0 20px rgba(239, 68, 68, 0.5), 0 0 60px rgba(239, 68, 68, 0.15)",
        "neon-sm-brand": "0 0 10px rgba(68, 96, 255, 0.45)",
        "neon-sm-ghost": "0 0 10px rgba(217, 70, 239, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
