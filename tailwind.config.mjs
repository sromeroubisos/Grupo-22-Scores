/** @type {import('tailwindcss').Config} */
const config = {
    darkMode: "class",
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Montserrat', 'sans-serif'],
                display: ['Inter', 'sans-serif'],
            },
            colors: {
                background: "var(--color-bg-primary)",
                foreground: "var(--color-text-primary)",
                surface: "var(--color-bg-secondary)",
                "surface-hover": "var(--color-bg-hover)",
                divider: "var(--color-border)",
                "system-secondary": "var(--color-text-secondary)",
                "system-primary": "var(--color-text-primary)",
                "accent-blue": "var(--color-info)",
                "primary": "#2563EB",
                "primary-hover": "#1D4ED8",
                "background-light": "#F3F4F6",
                "background-dark": "#111827",
                "surface-light": "#FFFFFF",
                "surface-dark": "#1F2937",
                "border-light": "#E5E7EB",
                "border-dark": "#374151",
                "tm-bg": "var(--tm-bg)",
                "tm-surface": "var(--tm-surface)",
                "tm-surface-2": "var(--tm-surface-2)",
                "tm-border": "var(--tm-border-solid)",
                "tm-accent": "var(--tm-accent)",
                "tm-text": "var(--tm-text)",
                "tm-dim": "var(--tm-text-dim)",
                "tm-muted": "var(--tm-text-muted)",
            },
        },
    },
    plugins: [],
};
export default config;
