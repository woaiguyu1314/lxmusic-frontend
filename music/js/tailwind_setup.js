/**
 * Tailwind Configuration Injection
 * This file injects the tailwind configuration to map 'emerald' to our CSS variables.
 * Must be loaded AFTER tailwindcss.js (CDN) or configured appropriately.
 */

tailwind.config = {
    darkMode: 'class',
    safelist: [
        'animate-marquee','animate-pulse','animate-spin','bg-blue-50','bg-emerald-50',
        'bg-emerald-500','flex','gap-4','hidden','hover:text-emerald-500','items-center',
        'items-start','mt-1','mt-8','opacity-0','opacity-100','opacity-30','opacity-40',
        'opacity-50','overflow-hidden','p-3','p-6','ring-2','rotate-180','rotate-90',
        'scale-100','scale-95','scale-[1.02]','scale-x-0','text-center','text-emerald-500',
        'text-emerald-600','text-gray-300','text-red-500','translate-x-0','translate-x-full',
        'translate-y-0','translate-y-10','translate-y-12','translate-y-20','translate-y-[100%]',
        'translate-y-[110%]'
    ],
    theme: {
        extend: {
            screens: {
                // Shift all breakpoints up to accommodate iPad Pro Portrait (1024px) as mobile
                'md': '1025px', // Desktop boundary
                'lg': '1280px',
                'xl': '1440px',
                '2xl': '1536px',
            },
            colors: {
                // Override 'emerald' to use our CSS variables
                // This allows us to change the theme without changing class names in HTML
                emerald: {
                    50: 'var(--c-50)',
                    100: 'var(--c-100)',
                    200: 'var(--c-200)',
                    300: 'var(--c-300)',
                    400: 'var(--c-400)',
                    500: 'var(--c-500)',
                    600: 'var(--c-600)',
                    700: 'var(--c-700)',
                    800: 'var(--c-800)',
                    900: 'var(--c-900)',
                    950: 'var(--c-950)',
                }
            }
        }
    }
}
