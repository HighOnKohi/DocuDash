/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // DocuDash design tokens (light mode only — matched to the DocuDash royal blue & gold logo).
        primary: {
          DEFAULT: '#01227F',
          hover: '#1D3FA3',
          50: '#EEF2FF',
          100: '#DCE5FF',
          200: '#B8C9F8',
          600: '#1D3FA3',
          700: '#01227F',
          800: '#00175A',
        },
        accent: {
          DEFAULT: '#FBC128',
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          500: '#FBC128',
          600: '#D97706',
          700: '#B45309',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F8FAFC',
        },
        border: {
          DEFAULT: '#E2E8F0',
          strong: '#CBD5E1',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#475569',
          subtle: '#64748B',
        },
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
