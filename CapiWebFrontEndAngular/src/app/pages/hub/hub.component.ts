import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, signal, inject, computed, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { trigger, state, style, transition, animate, stagger, query } from '@angular/animations';
import { ApiClientService } from '../../services/api-client.service';
import { UserIconComponent } from '../fileshare/components/user-icon/user-icon.component';

@Component({
    selector: 'app-hub',
    standalone: true,
    imports: [CommonModule, UserIconComponent],
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

    handleUserUpdated(updatedUser: any) {
        this.user.set(updatedUser);
    }

    handleLogout() {
        this.logout();
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
        const clickedInside = target.closest('.user-avatar') || target.closest('.user-icon-container');
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
