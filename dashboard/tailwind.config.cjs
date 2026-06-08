/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 18px 48px rgba(15, 23, 42, 0.22)"
      }
    }
  },
  plugins: []
};
