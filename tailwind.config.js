/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2196F3',
        'primary-dark': '#1976D2',
        secondary: '#B5BBC2',
        accent: '#E5E9EE',
      }
    },
  },
  plugins: [],
}
