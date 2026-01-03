import { Component, input, output, signal, inject, ViewChild, TemplateRef, ElementRef } from '@angular/core';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiClientService } from '../../../../services/api-client.service';
import { GoogleAuthService } from '../../../../services/google-auth.service';
import { ProfilePhotoEditorComponent } from '../../../../shared/components/profile-photo-editor/profile-photo-editor.component';

interface User {
    id: number;
    username: string;
    email?: string;
    telegram_id?: number | null;
    is_staff?: boolean;
    profile_picture_url?: string | null;
    has_google?: boolean;
    google_email?: string | null;
    has_password?: boolean;
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
    imports: [CommonModule, FormsModule, ProfilePhotoEditorComponent, MatDialogModule, MatMenuModule, MatButtonModule],
    templateUrl: './user-icon.component.html',
    styleUrls: ['../../fileshare.component.css', './user-icon.component.css'],
})
export class UserIconComponent {
    user = input<User | null>(null);
    logout = output<void>();
    userUpdated = output<User>();

    private apiClient = inject(ApiClientService);
    private googleAuth = inject(GoogleAuthService);
    private dialog = inject(MatDialog);

    @ViewChild('editModalTemplate') editModalTemplate!: TemplateRef<any>;
    @ViewChild('photoEditorTemplate') photoEditorTemplate!: TemplateRef<any>;
    photoDialogRef: MatDialogRef<any> | null = null;

    // isOpen logic removed as MatMenu handles visibility
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

    // Google OAuth states
    googleEnabled = signal(false);
    googleLoading = signal(false);
    googleError = signal<string | null>(null);

    @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

    constructor(private router: Router) {
        // Initialize Google Auth
        this.initGoogleAuth();
    }

    private async initGoogleAuth() {
        const enabled = await this.googleAuth.initialize();
        this.googleEnabled.set(enabled);
    }

    // Dropdown toggle logic removed (replaced by MatMenu)

    handleLogoutClick(): void {
        this.logout.emit();
    }

    // Generate a unique gradient based on username
    getUserColor(username: string): string {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h1 = Math.abs(hash % 360);
        const h2 = Math.abs((hash * 2) % 360);
        return `linear-gradient(135deg, hsl(${h1}, 70%, 50%) 0%, hsl(${h2}, 70%, 60%) 100%)`;
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
        // this.isOpen.set(false); // No needed

        console.log('UserIcon: Intentando abrir modal de edición');
        if (!this.editModalTemplate) {
            console.error('UserIcon: editModalTemplate no encontrado!');
        } else {
            console.log('UserIcon: Abriendo MatDialog...');
        }

        // Open MatDialog
        this.dialog.open(this.editModalTemplate, {
            panelClass: 'dark-dialog-panel',
            width: '520px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            autoFocus: false
        });
    }

    closeEditModal(): void {
        this.dialog.closeAll();
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
        // Close modal and show spinner on avatar
        this.dialog.closeAll();
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
            // Re-open modal to show error - we need to reopen it since we closed it
            this.openEditModal();
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

            // Open Photo Editor in a Dialog (on top of edit modal)
            this.photoDialogRef = this.dialog.open(this.photoEditorTemplate, {
                panelClass: 'photo-editor-dialog',
                maxWidth: '100vw',
                maxHeight: '100vh',
                height: '100vh',
                width: '100vw',
                hasBackdrop: false // Component has its own backdrop
            });
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

        this.stagedPhotoUrl.set(previewUrl);

        // Close editor dialog
        this.photoDialogRef?.close();
        this.selectedPhotoFile.set(null);
    }

    onPhotoCanceled(): void {
        this.photoDialogRef?.close();
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

    // ---- Google OAuth Methods ----
    async linkGoogleAccount(): Promise<void> {
        if (!this.googleEnabled()) return;

        this.googleLoading.set(true);
        this.googleError.set(null);

        try {
            const code = await this.googleAuth.requestAuthCode();
            const result = await this.googleAuth.linkAccount(code);

            // Update user with Google info
            const currentUser = this.user();
            if (currentUser) {
                this.userUpdated.emit({
                    ...currentUser,
                    has_google: true,
                    google_email: result.google_email,
                });
            }

            this.editSuccess.set('Cuenta de Google vinculada exitosamente');
        } catch (error: any) {
            const message = error?.error?.error || error?.message || 'Error al vincular cuenta de Google';
            this.googleError.set(message);
        } finally {
            this.googleLoading.set(false);
        }
    }

    async unlinkGoogleAccount(): Promise<void> {
        this.googleLoading.set(true);
        this.googleError.set(null);

        try {
            await this.googleAuth.unlinkAccount();

            // Update user
            const currentUser = this.user();
            if (currentUser) {
                this.userUpdated.emit({
                    ...currentUser,
                    has_google: false,
                    google_email: null,
                });
            }

            this.editSuccess.set('Cuenta de Google desvinculada exitosamente');
        } catch (error: any) {
            const message = error?.error?.error || error?.message || 'Error al desvincular cuenta de Google';
            this.googleError.set(message);
        } finally {
            this.googleLoading.set(false);
        }
    }
}

