/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nwbus: {
          primary: '#1B3A6B',
          secondary: '#E8A020',
          accent: '#2ECC71',
          danger: '#E74C3C',
          dark: '#0F2444',
        },
      },
      fontFamily: {
        arabic: ['Tajawal', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
