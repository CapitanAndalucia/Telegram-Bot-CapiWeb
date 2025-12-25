import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, signal, inject, computed, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { trigger, state, style, transition, animate, stagger, query } from '@angular/animations';
import { firstValueFrom } from 'rxjs';
import { ApiClientService } from '../../services/api-client.service';

@Component({
    selector: 'app-hub',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './hub.component.html',
    styleUrls: ['./hub.component.css'],
    animations: [
        trigger('containerAnimation', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('1s ease-out', style({ opacity: 1 }))
            ])
        ])
    ]
})
export class HubComponent implements AfterViewInit, OnDestroy {
    @ViewChild('container') container!: ElementRef;
    private apiClient = inject(ApiClientService);

    currentTime = signal<string>('');
    currentDate = signal<string>('');
    user = signal<any>(null);
    showUserMenu = signal(false);
    showEditModal = signal(false);
    editLoading = signal(false);
    editError = signal<string | null>(null);
    editSuccess = signal<string | null>(null);
    editData = signal({
        username: '',
        email: '',
        telegram_id: '',
        oldPassword: '',
        newPassword1: '',
        newPassword2: ''
    });
    showOldPassword = signal(false);
    showNewPassword1 = signal(false);
    showNewPassword2 = signal(false);

    greeting = computed(() => {
        const hour = new Date().getHours();
        let greet = 'Hola';
        if (hour >= 6 && hour < 12) greet = 'Buenos días';
        else if (hour >= 12 && hour < 20) greet = 'Buenas tardes';
        else greet = 'Buenas noches';

        const userData = this.user();
        if (userData && userData.username) {
            return `${greet}, ${userData.username}`;
        }
        return greet;
    });

    private timeInterval: any;

    searchTerm = signal('');

    filteredApps = computed(() => {
        const term = this.searchTerm().toLowerCase();
        const userData = this.user();
        const isStaff = userData?.is_staff || false;

        return this.apps.filter(app => {
            // Filter out Admin and API for non-staff users
            if ((app.route === '/admin' || app.route === '/api') && !isStaff) {
                return false;
            }

            return app.title.toLowerCase().includes(term) ||
                app.description.toLowerCase().includes(term);
        });
    });

    apps = [
        {
            title: 'Workouts',
            description: 'Seguimiento de entrenamientos y rutinas',
            icon: '💪',
            route: '/workouts'
        },
        {
            title: 'Portfolio Personal',
            description: 'Mi trayectoria profesional y proyectos destacados',
            icon: '👨‍💻',
            route: '/portfolio'
        },
        {
            title: 'Portfolio Arte',
            description: 'Galería de arte y proyectos creativos',
            icon: '🎨',
            route: '/portafolio/portfolio_arte'
        },
        {
            title: 'Tickets',
            description: 'Gestión de tareas e incidencias',
            icon: '🎫',
            route: '/tickets'
        },
        {
            title: 'File Share',
            description: 'Intercambio seguro de archivos',
            icon: '📁',
            route: '/fileshare'
        },
        {
            title: 'Django Admin',
            description: 'Panel de administración del backend',
            icon: '⚙️',
            route: '/admin'
        },
        {
            title: 'Django API',
            description: 'Documentación y endpoints de la API',
            icon: '🔌',
            route: '/api'
        }
    ];

    updateSearch(term: string) {
        this.searchTerm.set(term);
    }

    constructor(private router: Router) {
        this.updateTime();
        this.timeInterval = setInterval(() => this.updateTime(), 1000);
        this.checkAuth();
    }

    ngAfterViewInit() {
        // No specific after view init logic needed for now
    }

    ngOnDestroy() {
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
        }
    }

    async checkAuth() {
        try {
            const userData = await this.apiClient.checkAuth();
            this.user.set(userData);
        } catch (error) {
            console.log('User not authenticated');
            this.user.set(null);
        }
    }

    updateTime() {
        const now = new Date();
        this.currentTime.set(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
        const dateStr = now.toLocaleDateString('es-ES', options);
        this.currentDate.set(dateStr.charAt(0).toUpperCase() + dateStr.slice(1));
    }

    navigateTo(route: string) {
        if (route.startsWith('/admin')) {
            window.location.href = route;
        } else if (route.startsWith('/api')) {
            window.open(route, '_blank');
        } else {
            this.router.navigate([route]);
        }
    }

    toggleUserMenu() {
        this.showUserMenu.update(v => !v);
    }

    openEditModal() {
        const currentUser = this.user();
        if (!currentUser) {
            this.navigateToLogin();
            return;
        }

        this.editData.set({
            username: currentUser.username || '',
            email: currentUser.email || '',
            telegram_id: currentUser.telegram_id ?? '',
            oldPassword: '',
            newPassword1: '',
            newPassword2: ''
        });
        this.editError.set(null);
        this.editSuccess.set(null);
        this.showUserMenu.set(false);
        this.showEditModal.set(true);
    }

    closeEditModal() {
        this.showEditModal.set(false);
    }

    onEditFieldChange(
        field: 'username' | 'email' | 'telegram_id' | 'oldPassword' | 'newPassword1' | 'newPassword2',
        value: string
    ) {
        this.editData.update(data => ({
            ...data,
            [field]: value
        }));
    }

    toggleOldPasswordVisibility() {
        this.showOldPassword.update(v => !v);
    }

    toggleNewPassword1Visibility() {
        this.showNewPassword1.update(v => !v);
    }

    toggleNewPassword2Visibility() {
        this.showNewPassword2.update(v => !v);
    }

    async saveUserEdits() {
        const currentUser = this.user();
        if (!currentUser) {
            this.editError.set('Debes iniciar sesión para editar tus datos.');
            return;
        }

        const payload: any = {
            username: this.editData().username.trim(),
            email: this.editData().email.trim()
        };

        const telegramValue = this.editData().telegram_id;
        payload.telegram_id = telegramValue === '' ? null : Number(telegramValue);
        if (Number.isNaN(payload.telegram_id)) {
            payload.telegram_id = null;
        }

        const wantsPasswordChange = [
            this.editData().oldPassword.trim(),
            this.editData().newPassword1.trim(),
            this.editData().newPassword2.trim()
        ].some(Boolean);

        if (wantsPasswordChange) {
            const oldPwd = this.editData().oldPassword.trim();
            const new1 = this.editData().newPassword1.trim();
            const new2 = this.editData().newPassword2.trim();

            if (!oldPwd) {
                this.editError.set('Debes introducir tu contraseña actual.');
                return;
            }
            if (!new1 || !new2) {
                this.editError.set('Debes introducir la nueva contraseña dos veces.');
                return;
            }
            if (new1 !== new2) {
                this.editError.set('Las nuevas contraseñas no coinciden.');
                return;
            }

            payload.old_password = oldPwd;
            payload.password = new1;
        }

        this.editLoading.set(true);
        this.editError.set(null);
        this.editSuccess.set(null);

        try {
            const updated = await firstValueFrom(this.apiClient.updateUserDetail(currentUser.id, payload));
            this.user.set({ ...currentUser, ...updated });
            this.editSuccess.set('Datos actualizados correctamente');
            this.showEditModal.set(false);
        } catch (error: any) {
            const message = error?.message || 'No se pudieron actualizar los datos';
            this.editError.set(message);
        } finally {
            this.editLoading.set(false);
        }
    }

    navigateToLogin() {
        this.router.navigate(['/login'], { queryParams: { redirect: '/' } });
    }

    navigateToRegister() {
        this.router.navigate(['/register'], { queryParams: { redirect: '/' } });
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const clickedInside = target.closest('.user-avatar');
        if (this.showUserMenu() && !clickedInside) {
            this.showUserMenu.set(false);
        }
    }

    async logout() {
        try {
            await this.apiClient.logout();
            this.user.set(null);
            this.showUserMenu.set(false);
        } catch (error) {
            console.error('Logout failed', error);
        }
    }
}
