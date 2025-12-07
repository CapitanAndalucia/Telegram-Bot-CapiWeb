import { Component, signal, computed, OnInit, Input } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../services/api-client.service';
import { ApiError } from '../../models/api-error';

interface AuthForm {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}

interface PasswordStrength {
    width: string;
    level: 'empty' | 'weak' | 'medium' | 'strong';
    label: string;
}

@Component({
    selector: 'app-auth',
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './auth.component.html',
    styleUrl: './auth.component.css'
})
export class AuthComponent implements OnInit {
    @Input() set initialMode(value: 'login' | 'register') {
        this.mode.set(value);
    }
    @Input() redirectPath = '/';
    @Input() customTitle?: string;

    mode = signal<'login' | 'register'>('login');

    form = signal<AuthForm>({
        username: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    status = signal({
        loading: false,
        error: '',
        success: ''
    });

    passwordStrength = computed(() => this.calculatePasswordStrength(this.form().password));

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

    displayTitle = computed(() => this.customTitle || this.meta().heading);

    constructor(
        private apiClient: ApiClientService,
        private router: Router,
        protected route: ActivatedRoute
    ) { }

    ngOnInit() {
        // Override in child components
    }

    goBack() {
        this.router.navigate(['/']);
    }

    updateForm(field: keyof AuthForm, value: string) {
        this.form.update(f => ({ ...f, [field]: value }));
    }

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
                await this.apiClient.register({
                    username: formData.username.trim(),
                    password: formData.password,
                    email: formData.email.trim() || undefined,
                }).toPromise();
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
