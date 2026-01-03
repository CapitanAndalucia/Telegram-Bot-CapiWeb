/**
 * Google OAuth Service
 * 
 * Maneja la autenticación con Google OAuth 2.0.
 * El flujo es seguro: Angular solo obtiene el authorization code,
 * que se envía al backend para validación server-side.
 */
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

declare const google: any;

export interface GoogleAuthConfig {
    enabled: boolean;
    client_id: string | null;
}

export interface GoogleAuthResponse {
    status?: 'link_required' | 'username_required';
    message: string;
    user?: { id: number; username: string; email: string };
    existing_username?: string;
    google_email?: string;
    suggested_username?: string;
    pending_token?: string;  // Token temporal para confirmar sin re-autenticar
    error?: string;
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
    private http = inject(HttpClient);

    /** Configuración de Google OAuth obtenida del backend */
    config = signal<GoogleAuthConfig | null>(null);

    /** Indica si el servicio está inicializado y listo para usar */
    isInitialized = signal(false);

    /** Indica si hay una operación en progreso */
    isLoading = signal(false);

    private codeClient: any = null;
    private pendingResolve: ((code: string) => void) | null = null;
    private pendingReject: ((error: Error) => void) | null = null;

    /**
     * Inicializa el servicio cargando la configuración del backend
     * y el SDK de Google Identity Services.
     * 
     * @returns true si Google OAuth está disponible y configurado
     */
    async initialize(): Promise<boolean> {
        if (this.isInitialized()) return true;

        try {
            // Obtener configuración del backend
            const config = await firstValueFrom(
                this.http.get<GoogleAuthConfig>('/api/auth/google/config/')
            );
            this.config.set(config);

            if (!config.enabled || !config.client_id) {
                console.log('Google OAuth no está configurado en el servidor');
                return false;
            }

            // Cargar SDK de Google
            await this.loadGoogleScript();
            await this.initializeGoogleClient(config.client_id);

            this.isInitialized.set(true);
            return true;
        } catch (error) {
            console.error('Error inicializando Google Auth:', error);
            return false;
        }
    }

    /**
     * Carga el script de Google Identity Services de forma asíncrona
     */
    private loadGoogleScript(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Si ya está cargado, resolver inmediatamente
            if (typeof google !== 'undefined' && google.accounts) {
                resolve();
                return;
            }

            // Verificar si ya hay un script en proceso de carga
            const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
            if (existingScript) {
                existingScript.addEventListener('load', () => resolve());
                existingScript.addEventListener('error', () => reject(new Error('Error cargando SDK de Google')));
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Error cargando SDK de Google'));
            document.head.appendChild(script);
        });
    }

    /**
     * Inicializa el cliente OAuth de Google para el flujo de authorization code
     */
    private initializeGoogleClient(clientId: string): Promise<void> {
        return new Promise((resolve) => {
            this.codeClient = google.accounts.oauth2.initCodeClient({
                client_id: clientId,
                scope: 'email profile openid',
                ux_mode: 'popup',
                callback: (response: any) => {
                    if (response.code && this.pendingResolve) {
                        this.pendingResolve(response.code);
                    } else if (response.error && this.pendingReject) {
                        this.pendingReject(new Error(response.error_description || response.error));
                    }
                    this.pendingResolve = null;
                    this.pendingReject = null;
                },
            });
            resolve();
        });
    }

    /**
     * Inicia el flujo de OAuth y obtiene el authorization code.
     * Abre un popup de Google para que el usuario se autentique.
     * 
     * @returns El authorization code para enviar al backend
     */
    requestAuthCode(): Promise<string> {
        if (!this.codeClient) {
            return Promise.reject(new Error('Google Auth no inicializado'));
        }

        return new Promise((resolve, reject) => {
            this.pendingResolve = resolve;
            this.pendingReject = reject;
            this.codeClient.requestCode();
        });
    }

    /**
     * Autentica con Google (login o registro).
     * El backend se encarga de:
     * - Validar el token con Google
     * - Buscar/crear usuario
     * - Retornar JWT propio
     * 
     * @param codeOrToken Authorization code de Google O pending_token
     * @param options Opciones adicionales para el flujo
     */
    async authenticate(codeOrToken: string, options?: {
        username?: string;
        confirm_link?: boolean;
        isPendingToken?: boolean;  // true si es un pending_token en lugar de code
    }): Promise<GoogleAuthResponse> {
        this.isLoading.set(true);
        try {
            const body: any = { ...options };

            // Determinar si es un code o un pending_token
            if (options?.isPendingToken) {
                body.pending_token = codeOrToken;
                delete body.isPendingToken;
            } else {
                body.code = codeOrToken;
            }

            const response = await firstValueFrom(
                this.http.post<GoogleAuthResponse>('/api/auth/google/', body)
            );
            return response;
        } finally {
            this.isLoading.set(false);
        }
    }

    /**
     * Vincula la cuenta de Google al usuario autenticado actual.
     * Útil para usuarios que quieren añadir Google como método de login.
     * 
     * @param code Authorization code de Google
     */
    async linkAccount(code: string): Promise<{ message: string; google_email: string }> {
        this.isLoading.set(true);
        try {
            return await firstValueFrom(
                this.http.post<{ message: string; google_email: string }>('/api/auth/google/link/', { code })
            );
        } finally {
            this.isLoading.set(false);
        }
    }

    /**
     * Desvincula la cuenta de Google del usuario actual.
     * Solo funciona si el usuario tiene contraseña establecida.
     */
    async unlinkAccount(): Promise<{ message: string }> {
        this.isLoading.set(true);
        try {
            return await firstValueFrom(
                this.http.post<{ message: string }>('/api/auth/google/unlink/', {})
            );
        } finally {
            this.isLoading.set(false);
        }
    }
}
