/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Tema OwnVault - dark modern
                bg: '#0f172a',
                panel: 'rgba(30,41,59,0.6)',
                primary: '#3b82f6',
                'primary-dark': '#2563eb',
                brand: '#3b82f6',
                accent: '#22c55e',
                secondary: '#64748b',
            },
            backdropBlur: {
                xs: '2px'
            }
        },
    },
    plugins: [],
}
