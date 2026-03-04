/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0c0b09',
          card: '#16140f',
          surface: '#1e1c17',
        },
        accent: {
          DEFAULT: '#024536',
          hover: '#036B4E',
        },
        text: {
          primary: '#eee4db',
          secondary: '#aaa',
          muted: '#777',
        },
        galaxy: {
          teal: '#3D8B6E',
          copper: '#D4A574',
          sage: '#C5DDB9',
          company: '#024536',
        },
        success: '#5cb85c',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
