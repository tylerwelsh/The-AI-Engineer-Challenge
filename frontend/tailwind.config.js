/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#9E72C3',
        'primary-dark': '#924DBF',
        'primary-darker': '#7338A0',
        'primary-darkest': '#4A2574',
        'background': '#0F0529',
      },
    },
  },
  plugins: [],
} 