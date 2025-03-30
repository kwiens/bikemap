import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      keyframes: {
        'location-pulse': {
          '0%': {
            transform: 'translate(-50%, -50%) scale(0.5)',
            opacity: '1',
          },
          '100%': {
            transform: 'translate(-50%, -50%) scale(2)',
            opacity: '0',
          },
        },
      },
      animation: {
        'location-pulse': 'location-pulse 2s ease-out infinite',
      },
    },
  },
  plugins: [],
}

export default config 