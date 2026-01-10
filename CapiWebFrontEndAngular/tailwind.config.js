/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{html,ts}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Google Drive DARK mode color palette
                'gd-bg': '#1e1e1e',
                'gd-bg-elevated': '#2d2d2d',
                'gd-sidebar': '#1e1e1e',
                'gd-sidebar-hover': '#3c4043',
                'gd-border': '#3c4043',
                'gd-text': '#e8eaed',
                'gd-text-secondary': '#9aa0a6',
                'gd-blue': '#8ab4f8',
                'gd-blue-hover': '#aecbfa',
                'gd-selected': 'rgba(138, 180, 248, 0.24)',
                'gd-hover': 'rgba(232, 234, 237, 0.08)',
                'gd-card': '#303134',
                'gd-card-hover': '#3c4043',
                'gd-card-border': '#5f6368',
            },
            fontFamily: {
                'google': ['"Google Sans"', 'Roboto', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            },
            borderRadius: {
                'gd': '8px',
                'gd-lg': '16px',
                'gd-full': '24px',
            },
            boxShadow: {
                'gd-btn': '0 1px 2px 0 rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15)',
                'gd-card': '0 1px 2px 0 rgba(0,0,0,.3), 0 2px 6px 2px rgba(0,0,0,.15)',
                'gd-menu': '0 1px 3px 0 rgba(0,0,0,.3), 0 4px 8px 3px rgba(0,0,0,.15)',
            },
        },
    },
    plugins: [],
}
