import { Component, input, output, signal, ElementRef, HostListener, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiClientService } from '../../../../services/api-client.service';
import { ProfilePhotoEditorComponent } from '../../../../shared/components/profile-photo-editor/profile-photo-editor.component';

interface User {
    id: number;
    username: string;
    email?: string;
    telegram_id?: number | null;
    is_staff?: boolean;
    profile_picture_url?: string | null;
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
    imports: [CommonModule, FormsModule, ProfilePhotoEditorComponent],
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

    // Profile photo states
    showPhotoEditor = signal(false);
    selectedPhotoFile = signal<File | null>(null);
    photoUploading = signal(false);

    // Staged photo (not yet uploaded)
    stagedPhotoBlob = signal<Blob | null>(null);
    stagedPhotoUrl = signal<string | null>(null);

    @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

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

        // Only process password change if old password AND at least one new password field is filled
        const oldPwd = this.editData().oldPassword.trim();
        const new1 = this.editData().newPassword1.trim();
        const new2 = this.editData().newPassword2.trim();

        const wantsPasswordChange = oldPwd && (new1 || new2);

        if (wantsPasswordChange) {
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
        } else if (new1 || new2) {
            // User filled new password but not old password
            this.editError.set('Debes introducir tu contraseña actual para cambiarla.');
            return;
        }

        // Close modal and show spinner on avatar
        this.showEditModal.set(false);
        this.photoUploading.set(true);
        this.editError.set(null);
        this.editSuccess.set(null);

        try {
            // Upload staged photo first if exists
            let newProfilePictureUrl: string | null = null;
            const stagedBlob = this.stagedPhotoBlob();
            if (stagedBlob) {
                const photoResult = await this.apiClient.uploadProfilePhoto(stagedBlob);
                newProfilePictureUrl = photoResult.profile_picture_url;
                this.clearStagedPhoto();
            }

            // Update user data
            const updated = await firstValueFrom(this.apiClient.updateUserDetail(currentUser.id, payload));

            // Merge all updates
            const timestamp = new Date().getTime();
            const finalProfilePictureUrl = newProfilePictureUrl
                ? `${newProfilePictureUrl}?t=${timestamp}`
                : (currentUser.profile_picture_url ? `${currentUser.profile_picture_url.split('?')[0]}?t=${timestamp}` : null);

            const finalUser = {
                ...currentUser,
                ...updated,
                ...(newProfilePictureUrl ? { profile_picture_url: finalProfilePictureUrl } : {})
            } as User;

            this.userUpdated.emit(finalUser);
        } catch (error: any) {
            const message = error?.message || 'No se pudieron actualizar los datos';
            // Re-open modal to show error
            this.showEditModal.set(true);
            this.editError.set(message);
        } finally {
            this.photoUploading.set(false);
        }
    }

    // ---- Profile Photo Methods ----
    triggerPhotoSelect(): void {
        this.fileInputRef?.nativeElement?.click();
    }

    onPhotoSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            // Validate it's an image
            if (!file.type.startsWith('image/')) {
                this.editError.set('Por favor selecciona una imagen válida');
                return;
            }
            this.selectedPhotoFile.set(file);
            this.showPhotoEditor.set(true);
        }
        // Reset input for re-selection
        input.value = '';
    }

    onPhotoApply(imageBlob: Blob): void {
        // Stage the photo locally (don't upload yet)
        // Revoke old URL if exists
        const oldUrl = this.stagedPhotoUrl();
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
        }

        // Create preview URL for the staged photo
        const previewUrl = URL.createObjectURL(imageBlob);
        this.stagedPhotoBlob.set(imageBlob);
        this.stagedPhotoUrl.set(previewUrl);

        // Close editor, stay in modal
        this.showPhotoEditor.set(false);
        this.selectedPhotoFile.set(null);
    }

    onPhotoCanceled(): void {
        this.showPhotoEditor.set(false);
        this.selectedPhotoFile.set(null);
    }

    private clearStagedPhoto(): void {
        const url = this.stagedPhotoUrl();
        if (url) {
            URL.revokeObjectURL(url);
        }
        this.stagedPhotoBlob.set(null);
        this.stagedPhotoUrl.set(null);
    }
}

