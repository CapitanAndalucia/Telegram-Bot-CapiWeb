/**
 * Environment configuration for DEVELOPMENT
 * Este archivo se usa cuando ejecutas `ng serve` o `pnpm start`
 */
export const environment = {
    production: false,
    apiUrl: '/api',  // Usa el proxy en desarrollo
    appName: 'CapiWeb (DEV)',
    recaptchaSiteKey: '', // Rellena con tu site key en desarrollo si quieres activar CAPTCHA
    recaptchaEnabled: false,
};
