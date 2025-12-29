import { Component, EventEmitter, Input, Output, signal, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../../../services/api-client.service';
import { FileItem, Folder, FileAccess, FolderAccess } from '../../../../models/file-item.model';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'app-share-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './share-modal.component.html',
    styleUrls: ['./share-modal.component.css']
})
export class ShareModalComponent implements OnChanges {
    @Input() item!: FileItem | Folder;
    @Input() type!: 'file' | 'folder';
    @Output() close = new EventEmitter<void>();
    @Output() shared = new EventEmitter<void>();
    @Output() permissionDenied = new EventEmitter<void>(); // Nuevo evento para permisos denegados

    private api = inject(ApiClientService);
    private toast = inject(ToastrService);

    searchQuery = signal('');
    searchResults = signal<any[]>([]);
    friends = signal<any[]>([]);
    selectedUser = signal<any>(null);
    selectedPermission = signal<'read' | 'edit'>('read');
    propagateAccess = signal(true);
    isLoading = signal(false);
    isSharing = signal(false);
    loadingAccess = signal(false);
    accessList = signal<(FileAccess | FolderAccess)[]>([]);
    currentUser = signal<any>(null);

    constructor() {
        // Load friends initially
        this.loadFriends();
        // Get current user
        this.getCurrentUser();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['item'] || changes['type']) {
            this.resetFormState();
            // Cargar acceso normalmente (el modal solo se muestra si se verificaron permisos)
            if (this.item && this.type) {
                void this.loadAccessWithPermissionCheck();
            }
        }
    }

    // Método público para verificar permisos (llamado por el componente padre)
    async checkPermissions(): Promise<boolean> {
        try {
            // Verificar si tiene permisos para gestionar acceso
            if (this.type === 'file') {
                await this.api.listFileAccess(this.item.id);
            } else {
                await this.api.listFolderAccess(this.item.id);
            }
            return true; // Tiene permisos
        } catch (error: any) {
            console.error('Error checking permissions', error);
            
            // Si es un error 403 de permisos denegados
            if (error.status === 403) {
                this.permissionDenied.emit(); // Notificar al componente padre
                this.toast.error('No tienes permisos para gestionar el acceso a este archivo', '', {
                    timeOut: 5000,
                });
                return false;
            }
            
            // Otros errores
            this.toast.error('Error al verificar permisos');
            return false;
        }
    }

    // Método para cargar acceso (solo si ya se verificaron permisos)
    async loadAccessWithPermissionCheck(): Promise<void> {
        try {
            if (this.type === 'file') {
                const access = await this.api.listFileAccess(this.item.id);
                this.accessList.set(access);
            } else {
                const access = await this.api.listFolderAccess(this.item.id);
                this.accessList.set(access);
            }
        } catch (error: any) {
            console.error('Error loading access list', error);
            this.accessList.set([]);
        } finally {
            this.loadingAccess.set(false);
        }
    }

    private resetFormState(): void {
        this.selectedUser.set(null);
        this.searchQuery.set('');
        this.searchResults.set([]);
        this.selectedPermission.set('read');
        this.propagateAccess.set(true);
    }

    async loadFriends(): Promise<void> {
        try {
            const friends = await this.api.listFriends();
            this.friends.set(friends);
        } catch (error) {
            console.error('Error loading friends', error);
        }
    }

    async fetchAccessList(): Promise<void> {
        if (!this.item) return;
        this.loadingAccess.set(true);
        try {
            if (this.type === 'file') {
                const access = await this.api.listFileAccess(this.item.id);
                this.accessList.set(access);
            } else {
                const access = await this.api.listFolderAccess(this.item.id);
                this.accessList.set(access);
            }
        } catch (error: any) {
            console.error('Error fetching access list', error);
            
            // Si es un error 403 de permisos denegados, cerrar el modal y mostrar mensaje
            if (error.status === 403) {
                this.toast.warning('No tienes permisos para gestionar el acceso a este archivo');
                this.close.emit(); // Cerrar el modal
                return;
            }
            
            // Si hay un error 405, mostrar mensaje más amigable
            if (error.status === 405) {
                this.toast.warning('La función de compartir archivos está temporalmente deshabilitada');
            } else {
                this.toast.error('No se pudo cargar la lista de acceso');
            }
            this.accessList.set([]);
        } finally {
            this.loadingAccess.set(false);
        }
    }

    async onSearch(): Promise<void> {
        const query = this.searchQuery();
        if (!query) {
            this.searchResults.set([]);
            return;
        }

        this.isLoading.set(true);
        try {
            const results = await this.api.searchUsers(query);
            this.searchResults.set(results);
        } catch (error) {
            console.error('Search error', error);
        } finally {
            this.isLoading.set(false);
        }
    }

    selectUser(user: any): void {
        this.selectedUser.set(user);
        this.searchQuery.set(user.username);
        this.searchResults.set([]); // Clear results after selection
    }

    async share(): Promise<void> {
        const user = this.selectedUser();
        if (!user) {
            this.toast.error('Selecciona un usuario primero');
            return;
        }

        this.isSharing.set(true);
        try {
            if (this.type === 'file') {
                await this.api.shareFile(
                    (this.item as FileItem).id,
                    user.username,
                    this.selectedPermission(),
                    undefined
                );
            } else {
                await this.api.shareFolder(
                    (this.item as Folder).id,
                    user.username,
                    this.selectedPermission(),
                    this.propagateAccess(),
                    undefined
                );
            }
            this.toast.success(`Acceso concedido a ${user.username}`);
            this.shared.emit();
            await this.fetchAccessList();
            this.selectedUser.set(null);
            this.searchQuery.set('');
        } catch (error: any) {
            const message = error?.message || error?.payload?.error || 'Error al compartir';
            this.toast.error(message);
        } finally {
            this.isSharing.set(false);
        }
    }

    async revokeAccess(access: FileAccess | FolderAccess): Promise<void> {
        try {
            if (this.type === 'file') {
                await this.api.revokeFileAccess((this.item as FileItem).id, access.granted_to);
            } else {
                await this.api.revokeFolderAccess((this.item as Folder).id, access.granted_to);
            }
            this.toast.success(`Acceso eliminado para ${access.granted_to_username}`);
            await this.fetchAccessList();
            this.shared.emit();
        } catch (error: any) {
            const message = error?.message || error?.payload?.error || 'Error al revocar acceso';
            this.toast.error(message);
        }
    }

    hasAccessEntries(): boolean {
        return this.accessList().length > 0;
    }

    getCurrentUser(): void {
        // Get current user from localStorage or sessionStorage
        const userStr = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
        if (userStr) {
            try {
                this.currentUser.set(JSON.parse(userStr));
            } catch (e) {
                // Silently handle error
                this.currentUser.set(null);
            }
        }
    }

    getOwnerInfo(): { username: string, isOriginal: boolean } {
        if (!this.item) return { username: '', isOriginal: false };
        
        let ownerUsername = '';
        let isOriginal = false;

        if (this.type === 'file') {
            const file = this.item as FileItem;
            ownerUsername = file.owner_username || '';
            // Si no hay usuario actual, asumimos que no es el original
            const currentUser = this.currentUser();
            isOriginal = currentUser && (file.owner_username === currentUser.username || file.uploader_username === currentUser.username);
        } else {
            const folder = this.item as Folder;
            // Usar directamente el owner_username del item
            ownerUsername = folder.owner_username || '';
            const currentUser = this.currentUser();
            isOriginal = currentUser && folder.owner_username === currentUser.username;
        }

        return { username: ownerUsername, isOriginal };
    }

    onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('comp-overlay')) {
            this.close.emit();
        }
    }
}
