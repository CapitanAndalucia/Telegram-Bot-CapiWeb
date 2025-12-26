/**
 * Environment configuration for PRODUCTION
 * Este archivo reemplaza a environment.ts cuando ejecutas `ng build` o `pnpm build`
 */
export const environment = {
    production: true,
    apiUrl: '/api',  // En producción, Nginx maneja el proxy
    appName: 'CapiWeb',
    recaptchaSiteKey: '' // Rellena con tu Site Key en producción
    ,recaptchaEnabled: false,
};
