/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sephraxia dark glass palette
        base: '#050409',
        accent: {
          violet: '#7d6fc4',
          pink: '#d4537e',
        },
        text: {
          primary: '#b8b0cc',
          muted: '#6d6680',
          heading: '#e2d8fa',
        },
        glass: {
          border: 'rgba(180,160,240,0.14)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        glass: '14px',
      },
      backdropBlur: {
        glass: '24px',
      },
      boxShadow: {
        'glow-violet': '0 0 16px rgba(125,111,196,0.5)',
        'glow-pink': '0 0 16px rgba(212,83,126,0.5)',
        'channel-active': 'inset 0 0 18px rgba(125,111,196,0.18)',
      },
    },
  },
  plugins: [],
};
