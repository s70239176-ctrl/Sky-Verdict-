/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: "#060B14",
        panel: "#0E1826",
        panel2: "#101C2E",
        grid: "#16233A",
        amber: {
          DEFAULT: "#FFB020",
          dim: "#B8801A",
        },
        cyan: {
          DEFAULT: "#2DD4CF",
          dim: "#1A9B96",
        },
        signal: {
          red: "#FF5C5C",
        },
        ink: {
          primary: "#E8EEF6",
          dim: "#7C8CA6",
          faint: "#4C5A72",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
        sans: ["'Manrope'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(45, 212, 207, 0.35)",
        "glow-amber": "0 0 24px -4px rgba(255, 176, 32, 0.35)",
      },
      keyframes: {
        sweep: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        pulse2: {
          "0%, 100%": { opacity: 0.35, transform: "scale(1)" },
          "50%": { opacity: 1, transform: "scale(1.15)" },
        },
        flip: {
          "0%": { transform: "rotateX(0deg)" },
          "50%": { transform: "rotateX(-90deg)" },
          "100%": { transform: "rotateX(0deg)" },
        },
      },
      animation: {
        sweep: "sweep 6s linear infinite",
        pulse2: "pulse2 2s ease-in-out infinite",
        flip: "flip 0.6s ease-in-out",
      },
    },
  },
  plugins: [],
};
