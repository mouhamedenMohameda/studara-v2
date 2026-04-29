/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1B6B4A', light: '#22c55e', dark: '#145238' },
      },
    },
  },
  plugins: [],
};
