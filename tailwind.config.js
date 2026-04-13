/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sand: "#f6f0e7",
        ink: "#1f1b18",
        ember: "#c9a96e",
        emberSoft: "#d4b87d",
        moss: "#56624f",
        slateWarm: "#776d63",
      },
      boxShadow: {
        panel: "0 18px 40px rgba(54, 37, 25, 0.08)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
}
