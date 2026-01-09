/**
 * auth.component.ts
 * ==================
 * 
 * Componente de autenticación para login y registro de usuarios.
 * 
 * Este componente maneja tanto la autenticación tradicional (usuario/contraseña)
 * como la autenticación con Google OAuth 2.0. Incluye flujos para:
 * - Login tradicional
 * - Registro tradicional con validación de contraseña
 * - Login con Google
 * - Vinculación de cuenta Google a cuenta existente
 * - Creación de cuenta nueva desde Google
 * 
 * Rutas relacionadas:
 * - /login: Muestra formulario de login
 * - /register: Muestra formulario de registro
 * 
 * @example
 * // En las rutas:
 * { path: 'login', component: LoginComponent }
 * { path: 'register', component: RegisterComponent }
 */
import { Component, signal, computed, OnInit, Input, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../services/api-client.service';
import { ApiError } from '../../models/api-error';
import { GoogleAuthService, GoogleAuthResponse } from '../../services/google-auth.service';

/**
 * Interfaz para el formulario de autenticación.
 * 
 * Contiene los campos necesarios tanto para login como para registro.
 */
interface AuthForm {
    /** Nombre de usuario */
    username: string;
    /** Correo electrónico (solo para registro) */
    email: string;
    /** Contraseña */
    password: string;
    /** Confirmación de contraseña (solo para registro) */
    confirmPassword: string;
}

/**
 * Interfaz para el indicador de fortaleza de contraseña.
 * 
 * Se utiliza para mostrar visualmente qué tan segura es la contraseña
 * durante el proceso de registro.
 */
interface PasswordStrength {
    /** Ancho de la barra de progreso (porcentaje) */
    width: string;
    /** Nivel de seguridad: vacío, débil, medio o fuerte */
    level: 'empty' | 'weak' | 'medium' | 'strong';
    /** Etiqueta descriptiva mostrada al usuario */
    label: string;
}

/**
 * Componente de autenticación (login/registro).
 * 
 * Maneja toda la lógica de autenticación de usuarios, incluyendo:
 * - Formularios de login y registro
 * - Validación de contraseñas con indicador de fortaleza
 * - Integración con Google OAuth
 * - Modales para flujos especiales de Google (vincular cuenta, crear usuario)
 * - Redirección post-autenticación
 * 
 * @selector app-auth
 * 
 * Inputs:
 * - initialMode: 'login' | 'register' - Modo inicial del formulario
 * - redirectPath: string - Ruta a redirigir tras autenticación (default: '/')
 * - customTitle: string - Título personalizado opcional
 * 
 * Señales (signals) principales:
 * - mode: Modo actual (login/register)
 * - form: Datos del formulario
 * - status: Estado de la operación (loading, error, success)
 * - googleEnabled: Si Google OAuth está disponible
 */
@Component({
    selector: 'app-auth',
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './auth.component.html',
    styleUrl: './auth.component.css'
})
export class AuthComponent implements OnInit {
    /** Servicio de autenticación con Google */
    private googleAuth = inject(GoogleAuthService);

    /**
     * Establece el modo inicial del formulario.
     * @param value - 'login' para iniciar sesión, 'register' para crear cuenta
     */
    @Input() set initialMode(value: 'login' | 'register') {
        this.mode.set(value);
    }

    /** Ruta a la que redirigir después de autenticación exitosa */
    @Input() redirectPath = '/';

    /** Título personalizado para el formulario (opcional) */
    @Input() customTitle?: string;

    /** Modo actual del formulario: login o register */
    mode = signal<'login' | 'register'>('login');

    /** Datos del formulario de autenticación */
    form = signal<AuthForm>({
        username: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    /** Estado de la operación actual */
    status = signal({
        /** Indica si hay una operación en curso */
        loading: false,
        /** Mensaje de error si la operación falló */
        error: '',
        /** Mensaje de éxito si la operación fue exitosa */
        success: ''
    });

    // ==================== Estados de Google OAuth ====================

    /** Indica si Google OAuth está disponible y configurado */
    googleEnabled = signal(false);

    /** Indica si hay una operación de Google en curso */
    googleLoading = signal(false);

    // Estados para modales de flujo de Google

    /** Muestra el modal para vincular cuenta Google a cuenta existente */
    showLinkModal = signal(false);

    /** Muestra el modal para elegir nombre de usuario (nuevo usuario de Google) */
    showUsernameModal = signal(false);

    /** Token temporal del backend para completar flujo de Google */
    pendingToken = signal<string | null>(null);

    /** Email de la cuenta de Google */
    pendingGoogleEmail = signal<string>('');

    /** Username de la cuenta existente (para vincular) */
    pendingExistingUsername = signal<string>('');

    /** Username sugerido por el backend */
    suggestedUsername = signal<string>('');

    /** Username elegido por el usuario */
    newUsername = signal<string>('');

    /** Fortaleza de la contraseña calculada (computed signal) */
    passwordStrength = computed(() => this.calculatePasswordStrength(this.form().password));

    /** Metadatos del formulario según el modo (textos, botones) */
    meta = computed(() => {
        const titles = {
            login: {
                heading: 'Iniciar Sesión',
                subheading: 'Bienvenido de nuevo',
                button: 'Iniciar sesión',
                linkText: '¿No tienes cuenta?',
                linkHref: '/register',
                linkCta: 'Regístrate aquí',
            },
            register: {
                heading: 'Crear Cuenta',
                subheading: 'Únete a nosotros',
                button: 'Crear cuenta',
                linkText: '¿Ya tienes cuenta?',
                linkHref: '/login',
                linkCta: 'Inicia sesión aquí',
            },
        };
        return titles[this.mode()];
    });

    /** Título a mostrar (personalizado o por defecto) */
    displayTitle = computed(() => this.customTitle || this.meta().heading);

    /** Clave del sitio para reCAPTCHA */
    recaptchaSiteKey = environment.recaptchaSiteKey;

    /** Indica si reCAPTCHA está habilitado */
    recaptchaEnabled = environment.recaptchaEnabled;

    /**
     * Constructor del componente.
     * 
     * @param apiClient - Servicio para comunicación con el backend
     * @param router - Router de Angular para navegación
     * @param route - Ruta activa para obtener parámetros
     */
    constructor(
        private apiClient: ApiClientService,
        private router: Router,
        protected route: ActivatedRoute
    ) { }

    /**
     * Inicializa el componente.
     * 
     * Configura Google OAuth si está disponible en el entorno.
     */
    async ngOnInit() {
        // Inicializar Google Auth
        const googleReady = await this.googleAuth.initialize();
        this.googleEnabled.set(googleReady);
    }

    /**
     * Navega de vuelta a la página principal.
     */
    goBack() {
        this.router.navigate(['/']);
    }

    /**
     * Actualiza un campo del formulario.
     * 
     * @param field - Nombre del campo a actualizar
     * @param value - Nuevo valor del campo
     */
    updateForm(field: keyof AuthForm, value: string) {
        this.form.update(f => ({ ...f, [field]: value }));
    }

    // ==================== Métodos de Google OAuth ====================

    async handleGoogleLogin() {
        if (!this.googleEnabled()) return;

        this.googleLoading.set(true);
        this.status.set({ loading: false, error: '', success: '' });

        try {
            // Obtener código de Google (abre popup)
            const code = await this.googleAuth.requestAuthCode();

            // Enviar al backend
            const response = await this.googleAuth.authenticate(code);

            if (response.status === 'link_required') {
                // Hay cuenta existente con mismo email - preguntar si vincular
                this.pendingToken.set(response.pending_token || null);
                this.pendingGoogleEmail.set(response.google_email || '');
                this.pendingExistingUsername.set(response.existing_username || '');
                this.showLinkModal.set(true);
            } else if (response.status === 'username_required') {
                // Usuario nuevo - pedir que elija username
                this.pendingToken.set(response.pending_token || null);
                this.pendingGoogleEmail.set(response.google_email || '');
                this.suggestedUsername.set(response.suggested_username || '');
                this.newUsername.set(response.suggested_username || '');
                this.showUsernameModal.set(true);
            } else if (response.user) {
                // Login exitoso
                this.status.set({
                    loading: false,
                    error: '',
                    success: 'Inicio de sesión exitoso con Google. Redirigiendo...'
                });
                setTimeout(() => this.router.navigate([this.redirectPath], { replaceUrl: true }), 600);
            }
        } catch (error: any) {
            const message = error?.error?.error || error?.message || 'Error al iniciar sesión con Google';
            this.status.set({
                loading: false,
                error: message,
                success: ''
            });
        } finally {
            this.googleLoading.set(false);
        }
    }

    async confirmLinkAccount() {
        const token = this.pendingToken();
        if (!token) {
            this.status.set({ loading: false, error: 'Token expirado. Intenta de nuevo.', success: '' });
            return;
        }

        this.googleLoading.set(true);
        this.showLinkModal.set(false);

        try {
            // Usar el pending_token para confirmar sin re-autenticar con Google
            const response = await this.googleAuth.authenticate(token, {
                confirm_link: true,
                isPendingToken: true
            });

            if (response.user) {
                this.status.set({
                    loading: false,
                    error: '',
                    success: 'Cuenta vinculada exitosamente. Redirigiendo...'
                });
                setTimeout(() => this.router.navigate([this.redirectPath], { replaceUrl: true }), 600);
            }
        } catch (error: any) {
            const message = error?.error?.error || error?.message || 'Error al vincular cuenta';
            this.status.set({
                loading: false,
                error: message,
                success: ''
            });
        } finally {
            this.googleLoading.set(false);
            this.pendingToken.set(null);
        }
    }

    cancelLinkAccount() {
        this.showLinkModal.set(false);
        this.pendingToken.set(null);
        this.status.set({
            loading: false,
            error: 'Vinculación cancelada. Debes vincular tu cuenta para usar Google.',
            success: ''
        });
    }

    async confirmNewUsername() {
        const token = this.pendingToken();
        const username = this.newUsername().trim();

        if (!token) {
            this.status.set({ loading: false, error: 'Token expirado. Intenta de nuevo.', success: '' });
            return;
        }

        if (!username) return;

        if (username.length < 3) {
            this.status.set({
                loading: false,
                error: 'El nombre de usuario debe tener al menos 3 caracteres',
                success: ''
            });
            return;
        }

        this.googleLoading.set(true);
        this.showUsernameModal.set(false);

        try {
            // Usar el pending_token para crear usuario sin re-autenticar con Google
            const response = await this.googleAuth.authenticate(token, {
                username,
                isPendingToken: true
            });
            if (response.user) {
                this.status.set({
                    loading: false,
                    error: '',
                    success: 'Cuenta creada exitosamente. Redirigiendo...'
                });
                setTimeout(() => this.router.navigate([this.redirectPath], { replaceUrl: true }), 600);
            } else if (response.error) {
                this.status.set({ loading: false, error: response.error, success: '' });
            }
        } catch (error: any) {
            const message = error?.error?.error || error?.message || 'Error al crear usuario';
            this.status.set({
                loading: false,
                error: message,
                success: ''
            });
        } finally {
            this.googleLoading.set(false);
            this.pendingToken.set(null);
        }
    }

    cancelNewUsername() {
        this.showUsernameModal.set(false);
        this.pendingToken.set(null);
    }

    // ==================== Standard Auth Methods ====================

    async handleSubmit() {
        const formData = this.form();
        this.status.set({ loading: true, error: '', success: '' });

        if (!formData.username || !formData.password) {
            this.status.set({ loading: false, error: 'Usuario y contraseña son obligatorios', success: '' });
            return;
        }

        if (this.mode() === 'register') {
            if (formData.password !== formData.confirmPassword) {
                this.status.set({ loading: false, error: 'Las contraseñas no coinciden', success: '' });
                return;
            }
            if (formData.password.length < 6) {
                this.status.set({ loading: false, error: 'La contraseña debe tener al menos 6 caracteres', success: '' });
                return;
            }
        }

        try {
            if (this.mode() === 'login') {
                await this.apiClient.login({
                    username: formData.username.trim(),
                    password: formData.password,
                }).toPromise();
                this.status.set({ loading: false, error: '', success: 'Inicio de sesión exitoso. Redirigiendo...' });
            } else {
                const payload: any = {
                    username: formData.username.trim(),
                    password: formData.password,
                    email: formData.email.trim() || undefined,
                };
                if (environment.recaptchaSiteKey && (window as any).grecaptcha) {
                    try {
                        const token = (window as any).grecaptcha.getResponse();
                        if (token) payload['g-recaptcha-response'] = token;
                    } catch (e) {
                        // ignore token retrieval errors
                    }
                }
                await this.apiClient.register(payload).toPromise();
                this.status.set({ loading: false, error: '', success: 'Registro exitoso. Redirigiendo...' });
            }

            setTimeout(() => this.router.navigate([this.redirectPath], { replaceUrl: true }), 600);
        } catch (error) {
            const message =
                error instanceof ApiError
                    ? error.payload?.error || 'Credenciales inválidas'
                    : 'Error de conexión. Intenta nuevamente.';
            this.status.set({ loading: false, error: message, success: '' });
        }
    }

    private calculatePasswordStrength(password: string): PasswordStrength {
        if (!password) {
            return { width: '0%', level: 'empty', label: '' };
        }
        let score = 0;
        if (password.length >= 6) score++;
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
        if (/\d/.test(password)) score++;
        if (/[^a-zA-Z\d]/.test(password)) score++;

        if (score >= 5) return { width: '100%', level: 'strong', label: '🟢 Seguridad: Fuerte' };
        if (score >= 3) return { width: '66%', level: 'medium', label: '🟡 Seguridad: Media' };
        return { width: '33%', level: 'weak', label: '🔴 Seguridad: Débil' };
    }
}
