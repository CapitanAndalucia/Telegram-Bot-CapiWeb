import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

interface User {
    username: string;
    email?: string;
    is_staff?: boolean;
}

@Component({
    selector: 'app-user-icon',
    imports: [CommonModule],
    templateUrl: './user-icon.component.html',
    styleUrls: ['../../fileshare.component.css'],
})
export class UserIconComponent {
    user = input<User | null>(null);
    logout = output<void>();

    isOpen = signal(false);

    constructor(private router: Router) { }

    toggleDropdown(): void {
        this.isOpen.update((v) => !v);
    }

    handleLogoutClick(): void {
        this.logout.emit();
        this.isOpen.set(false);
    }

    navigateToLogin(): void {
        this.router.navigate(['/auth/login'], {
            queryParams: { redirect: '/fileshare', title: 'Centro de Archivos' },
        });
    }

    navigateToRegister(): void {
        this.router.navigate(['/auth/register'], {
            queryParams: { redirect: '/fileshare', title: 'Centro de Archivos' },
        });
    }
}
