/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "'IBM Plex Sans Thai'", 'sans-serif'],
        sans: ["'IBM Plex Sans Thai'", "'Inter'", 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
