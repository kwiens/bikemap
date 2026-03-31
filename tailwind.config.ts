import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
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
        'recording-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.4)' },
          '50%': { boxShadow: '0 0 16px 6px rgba(239, 68, 68, 0.6)' },
        },
        'toast-slide-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        'toast-fade-in': {
          from: {
            opacity: '0',
            transform: 'translateX(-50%) translateY(-10px)',
          },
          to: { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
        },
        'toast-fade-out': {
          from: { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
          to: { opacity: '0', transform: 'translateX(-50%) translateY(-10px)' },
        },
        'welcome-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'welcome-fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'welcome-slide-up': {
          from: { opacity: '0', transform: 'translateY(40px) scale(0.95)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'welcome-slide-down': {
          from: { opacity: '1', transform: 'translateY(0) scale(1)' },
          to: { opacity: '0', transform: 'translateY(30px) scale(0.97)' },
        },
        'fade-in-out': {
          '0%': { opacity: '0' },
          '15%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'location-pulse': 'location-pulse 2s ease-out infinite',
        'recording-pulse': 'recording-pulse 3s ease-in-out infinite',
        'toast-slide-in': 'toast-slide-in 0.2s ease',
        'pulse-dot': 'pulse-dot 3s ease-in-out infinite',
        'toast-fade-in': 'toast-fade-in 0.3s ease-out',
        'toast-fade-out': 'toast-fade-out 0.3s ease-out forwards',
        'welcome-fade-in': 'welcome-fade-in 0.4s ease-out',
        'welcome-fade-out': 'welcome-fade-out 0.4s ease-in forwards',
        'welcome-slide-up': 'welcome-slide-up 0.45s ease-out',
        'welcome-slide-down': 'welcome-slide-down 0.35s ease-in forwards',
        'fade-in-out': 'fade-in-out 2s ease-in-out',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        // App brand colors
        'app-primary': '#c3f44d',
        'app-secondary': '#1a434e',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
