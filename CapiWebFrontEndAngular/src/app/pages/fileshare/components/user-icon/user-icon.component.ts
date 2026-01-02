import { Component, input, output, signal, ElementRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiClientService } from '../../../../services/api-client.service';

interface User {
    id: number;
    username: string;
    email?: string;
    telegram_id?: number | null;
    is_staff?: boolean;
}

interface EditData {
    username: string;
    email: string;
    telegram_id: string;
    oldPassword: string;
    newPassword1: string;
    newPassword2: string;
}

@Component({
    selector: 'app-user-icon',
    imports: [CommonModule, FormsModule],
    templateUrl: './user-icon.component.html',
    styleUrls: ['../../fileshare.component.css', './user-icon.component.css'],
})
export class UserIconComponent {
    user = input<User | null>(null);
    logout = output<void>();
    userUpdated = output<User>();

    private apiClient = inject(ApiClientService);

    isOpen = signal(false);
    showEditModal = signal(false);
    editData = signal<EditData>({
        username: '',
        email: '',
        telegram_id: '',
        oldPassword: '',
        newPassword1: '',
        newPassword2: ''
    });
    editError = signal<string | null>(null);
    editSuccess = signal<string | null>(null);
    editLoading = signal(false);
    showOldPassword = signal(false);
    showNewPassword1 = signal(false);
    showNewPassword2 = signal(false);

    constructor(private router: Router, private el: ElementRef) { }

    @HostListener('document:mousedown', ['$event'])
    onGlobalClick(event: MouseEvent): void {
        if (!this.el.nativeElement.contains(event.target) && !this.showEditModal()) {
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

    openEditModal(): void {
        const currentUser = this.user();
        if (!currentUser) {
            this.navigateToLogin();
            return;
        }

        this.editData.set({
            username: currentUser.username || '',
            email: currentUser.email || '',
            telegram_id: currentUser.telegram_id?.toString() ?? '',
            oldPassword: '',
            newPassword1: '',
            newPassword2: ''
        });
        this.editError.set(null);
        this.editSuccess.set(null);
        this.isOpen.set(false);
        this.showEditModal.set(true);
    }

    closeEditModal(): void {
        this.showEditModal.set(false);
    }

    onEditFieldChange(field: keyof EditData, value: string): void {
        this.editData.update(data => ({ ...data, [field]: value }));
    }

    toggleOldPasswordVisibility(): void {
        this.showOldPassword.update(v => !v);
    }

    toggleNewPassword1Visibility(): void {
        this.showNewPassword1.update(v => !v);
    }

    toggleNewPassword2Visibility(): void {
        this.showNewPassword2.update(v => !v);
    }

    async saveUserEdits(): Promise<void> {
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
            this.userUpdated.emit({ ...currentUser, ...updated } as User);
            this.editSuccess.set('Datos actualizados correctamente');
            this.showEditModal.set(false);
        } catch (error: any) {
            const message = error?.message || 'No se pudieron actualizar los datos';
            this.editError.set(message);
        } finally {
            this.editLoading.set(false);
        }
    }
}
