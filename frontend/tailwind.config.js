/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Ground — aviation control / editorial ink, not Web3 navy.
        ink: "#080909",
        "near-black": "#0D0F0F",
        graphite: "#171A19",
        ivory: "#F4F1E9",
        "ivory-soft": "#E9E6DD",
        paper: "#FFFFFF",

        // Signal colors — each one means one thing, everywhere.
        orange: {
          DEFAULT: "#FF5A1F", // active / monitoring / CTA
          dim: "#B8420F",
        },
        green: {
          DEFAULT: "#21C77A", // verified / settled
          dim: "#17925B",
        },
        blue: {
          DEFAULT: "#4B8DFF", // live data / telemetry
          dim: "#2E5FB0",
        },
        amber: {
          DEFAULT: "#F5A623", // pending / uncertain
          dim: "#B87A16",
        },
      },
      fontFamily: {
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Editorial scale — headlines are meant to be extremely large and tight.
        "display-1": ["clamp(3rem, 7vw, 7.5rem)", { lineHeight: "0.95", letterSpacing: "-0.03em" }],
        "display-2": ["clamp(2.25rem, 5vw, 4.5rem)", { lineHeight: "0.98", letterSpacing: "-0.025em" }],
        "display-3": ["clamp(1.75rem, 3vw, 2.75rem)", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
      borderRadius: {
        none: "0px",
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
      },
      keyframes: {
        "aircraft-move": {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(calc(100% - 1.25rem))" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.35 },
        },
        "flap-in": {
          "0%": { transform: "rotateX(-90deg)", opacity: 0 },
          "100%": { transform: "rotateX(0deg)", opacity: 1 },
        },
        sweep: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "aircraft-move": "aircraft-move 3.5s ease-in-out forwards",
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
        "flap-in": "flap-in 0.5s ease-out",
        sweep: "sweep 4s linear infinite",
      },
    },
  },
  plugins: [],
};
