/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette Việt cổ: nâu đất, vàng rơm, xanh tre
        dat: '#8A6B46',
        rom: '#D9B84A',
        tre: '#7BA23F',
      },
    },
  },
  plugins: [],
};
