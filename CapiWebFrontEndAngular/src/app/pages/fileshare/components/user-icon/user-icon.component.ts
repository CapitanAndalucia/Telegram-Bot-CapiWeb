import { Component, input, output, signal, ElementRef, HostListener } from '@angular/core';
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

    constructor(private router: Router, private el: ElementRef) { }

    @HostListener('document:mousedown', ['$event'])
    onGlobalClick(event: MouseEvent): void {
        if (!this.el.nativeElement.contains(event.target)) {
            this.isOpen.set(false);
        }
    }

    toggleDropdown(): void {
        this.isOpen.update((v) => !v);
    }

    handleLogoutClick(): void {
        this.logout.emit();
        this.isOpen.set(false);
    }

    navigateToLogin(): void {
        this.router.navigate(['/login'], {
            queryParams: { redirect: '/fileshare', title: 'Centro de Archivos' },
        });
    }

    navigateToRegister(): void {
        this.router.navigate(['/register'], {
            queryParams: { redirect: '/fileshare', title: 'Centro de Archivos' },
        });
    }
}
