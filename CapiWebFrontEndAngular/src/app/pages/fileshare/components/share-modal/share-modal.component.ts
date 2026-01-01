import { Component, EventEmitter, Input, Output, signal, inject, OnChanges, SimpleChanges, ElementRef, HostListener } from '@angular/core';
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

    private el = inject(ElementRef);

    private api = inject(ApiClientService);
    private toast = inject(ToastrService);

    searchQuery = signal('');
    searchResults = signal<any[]>([]);
    friends = signal<any[]>([]);
    selectedUser = signal<any>(null);
    selectedPermission = signal<'read' | 'edit'>('read');
    isLoading = signal(false);
    isSharing = signal(false);
    loadingAccess = signal(false);
    accessList = signal<(FileAccess | FolderAccess)[]>([]);
    currentUser = signal<any>(null);
    openDropdownId = signal<number | null>(null);

    // Share Link state
    shareLinks = signal<any[]>([]);
    loadingLinks = signal(false);
    generatingLink = signal(false);
    newLinkAccessType = signal<'anyone' | 'user'>('anyone');
    newLinkPermission = signal<'read' | 'edit'>('read');
    generatedLinkUrl = signal<string | null>(null);
    openConfigDropdown = signal<'access' | 'permission' | null>(null);

    // Redesign State
    viewMode = signal<'main' | 'invite'>('main');
    pendingInvites = signal<any[]>([]);
    // notificationMessage & notifyUsers removed
    inviteRole = signal<'read' | 'edit'>('read');

    // General Access State
    generalAccess = signal<'restricted' | 'anyone'>('restricted');
    generalAccessRole = signal<'read' | 'edit'>('read');

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
                void this.loadShareLinks();
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
        const currentPending = this.pendingInvites();
        if (!currentPending.find(u => u.id === user.id)) {
            this.pendingInvites.update(prev => [...prev, user]);
        }
        this.searchQuery.set('');
        this.searchResults.set([]);
        this.viewMode.set('invite');
    }

    removeFromPending(userId: number): void {
        this.pendingInvites.update(prev => prev.filter(u => u.id !== userId));
        if (this.pendingInvites().length === 0) {
            this.viewMode.set('main');
        }
    }

    cancelInvite(): void {
        this.pendingInvites.set([]);
        this.viewMode.set('main');
    }

    async share(): Promise<void> {
        if (this.pendingInvites().length === 0) return;

        this.isSharing.set(true);
        try {
            const users = this.pendingInvites();
            const role = this.inviteRole();
            // Notification and message implicitly handled or not supported by current API call


            // Process all invites
            // Note: API currently supports one by one, should be optimized in backend to bulk share
            // For now, we loop parallelly
            const promises = users.map(user => {
                if (this.type === 'folder') {
                    return this.api.shareFolder(this.item.id, user.id, role);
                } else {
                    return this.api.shareFile(this.item.id, user.id, role);
                }
            });

            await Promise.all(promises);

            this.toast.success(`Compartido con ${users.length} usuario(s)`);
            this.cancelInvite(); // Reset state and go back to main
            void this.loadAccessWithPermissionCheck(); // Refresh access list
            this.shared.emit();

        } catch (error) {
            console.error('Error sharing:', error);
            this.toast.error('Error al compartir');
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

    async updatePermission(access: FileAccess | FolderAccess, newPermission: 'read' | 'edit'): Promise<void> {
        this.isSharing.set(true);
        try {
            if (this.type === 'file') {
                await this.api.shareFile(
                    (this.item as FileItem).id,
                    access.granted_to_username,
                    newPermission,
                    undefined
                );
            } else {
                await this.api.shareFolder(
                    (this.item as Folder).id,
                    access.granted_to_username,
                    newPermission,
                    true, // Mantener propagación por defecto al actualizar
                    undefined
                );
            }
            this.toast.success(`Permisos actualizados para ${access.granted_to_username}`);
            // Recargar lista para confirmar cambios y actualizar UI
            await this.fetchAccessList();
            this.shared.emit();
        } catch (error: any) {
            const message = error?.message || error?.payload?.error || 'Error al actualizar permisos';
            this.toast.error(message);
        } finally {
            this.isSharing.set(false);
        }
    }

    toggleConfigDropdown(type: 'access' | 'permission', event: Event): void {
        event.stopPropagation();
        // Close other dropdown types
        this.openDropdownId.set(null);

        if (this.openConfigDropdown() === type) {
            this.openConfigDropdown.set(null);
        } else {
            this.openConfigDropdown.set(type);
        }
    }

    togglePermissionDropdown(accessId: number, event: Event): void {
        event.stopPropagation();
        // Close other dropdown types
        this.openConfigDropdown.set(null);

        if (this.openDropdownId() === accessId) {
            this.openDropdownId.set(null);
        } else {
            this.openDropdownId.set(accessId);
        }
    }

    closeDropdown(): void {
        this.openDropdownId.set(null);
        this.openConfigDropdown.set(null);
    }

    onChangePermissionClick(access: FileAccess | FolderAccess, newPermission: 'read' | 'edit', event: Event): void {
        event.stopPropagation();
        this.closeDropdown();
        if (access.permission !== newPermission) {
            this.updatePermission(access, newPermission);
        }
    }

    hasAccessEntries(): boolean {
        return this.accessList().length > 0;
    }

    async getCurrentUser(): Promise<void> {
        try {
            const response = await this.api.checkAuth();
            if (response && response.user) {
                this.currentUser.set(response.user);
            } else if (response && response.username) {
                // Fallback if response is just the user object
                this.currentUser.set(response);
            }
        } catch (error) {
            console.warn('Could not get current user info', error);
            this.currentUser.set(null);
        }
    }

    getOwnerInfo(): { username: string, isOriginal: boolean, email?: string } {
        if (!this.item) return { username: '', isOriginal: false };

        let ownerUsername = '';
        let isOriginal = false;
        let email: string | undefined;

        const currentUser = this.currentUser();

        if (this.type === 'file') {
            const file = this.item as FileItem;
            ownerUsername = file.owner_username || '';
            // Si no hay usuario actual, asumimos que no es el original
            isOriginal = currentUser ? (file.owner_username === currentUser.username || file.uploader_username === currentUser.username) : false;
        } else {
            const folder = this.item as Folder;
            // Usar directamente el owner_username del item
            ownerUsername = folder.owner_username || '';
            isOriginal = currentUser ? folder.owner_username === currentUser.username : false;
        }

        if (isOriginal && currentUser) {
            email = currentUser.email;
        }

        return { username: ownerUsername, isOriginal, email };
    }

    // UI Helpers
    focusSearch(event: Event): void {
        // Prevent focusing if clicking on chip or input (they handle their own focus)
        // But if clicking on container blank space, focus input.
        // Implementing basic toggle for now
    }

    onInputFocus(): void {
        this.viewMode.set('invite');
    }

    hasPublicLink(): boolean {
        return this.shareLinks().some(link => link.access_type === 'anyone');
    }

    getPublicLinkRole(): 'read' | 'edit' {
        const link = this.shareLinks().find(l => l.access_type === 'anyone');
        return link ? link.permission : 'read';
    }

    async createOrUpdatePublicLink(type: 'restricted' | 'anyone'): Promise<void> {
        if (type === 'restricted') {
            // Find public link and delete it
            const link = this.shareLinks().find(l => l.access_type === 'anyone');
            if (link) {
                await this.deleteShareLink(link.id);
            }
        } else {
            // Create public link if not exists
            if (!this.hasPublicLink()) {
                this.newLinkAccessType.set('anyone');
                this.newLinkPermission.set('read');
                // Use undefined instead of true if signature doesn't support arg
                await this.generateShareLink();
            }
        }
    }

    async updatePublicLinkRole(permission: 'read' | 'edit'): Promise<void> {
        const link = this.shareLinks().find(l => l.access_type === 'anyone');
        if (link) {
            // Delete and recreate because update API might not exist or we want simple logic
            // Actually, better to have an update endpoint. Assuming we replace it for now:
            await this.deleteShareLink(link.id);
            this.newLinkAccessType.set('anyone');
            this.newLinkPermission.set(permission);
            await this.generateShareLink();
        }
    }

    copyLink(): void {
        // Prefer public link, else use current page URL (fallback)
        const link = this.shareLinks().find(l => l.access_type === 'anyone');
        const url = link ? this.getFullUrl(link.url) : window.location.href;
        this.copyLinkToClipboard(url);
    }

    // ---- Share Links ----

    async loadShareLinks(): Promise<void> {
        if (!this.item) return;
        this.loadingLinks.set(true);
        try {
            const links = await this.api.getShareLinksForItem(this.type, this.item.id);
            this.shareLinks.set(links);
        } catch (error) {
            console.error('Error loading share links', error);
            this.shareLinks.set([]);
        } finally {
            this.loadingLinks.set(false);
        }
    }

    async generateShareLink(): Promise<void> {
        if (!this.item) return;
        this.generatingLink.set(true);
        this.generatedLinkUrl.set(null);

        try {
            const data: any = {
                access_type: this.newLinkAccessType(),
                permission: this.newLinkPermission(),
            };

            if (this.type === 'file') {
                data.file = this.item.id;
            } else {
                data.folder = this.item.id;
            }

            const result = await this.api.createShareLink(data);
            // Construir URL completa usando el origen actual (Angular frontend)
            const fullUrl = `${window.location.origin}${result.url}`;
            this.generatedLinkUrl.set(fullUrl);
            this.toast.success('¡Enlace generado!');

            // Recargar lista de enlaces
            await this.loadShareLinks();
        } catch (error: any) {
            const message = error?.message || 'Error al generar enlace';
            this.toast.error(message);
        } finally {
            this.generatingLink.set(false);
        }
    }

    async deleteShareLink(linkId: number): Promise<void> {
        try {
            await this.api.revokeShareLink(linkId);
            this.toast.success('Enlace revocado');
            await this.loadShareLinks();
        } catch (error: any) {
            this.toast.error('Error al revocar enlace');
        }
    }

    getFullUrl(relativePath: string): string {
        return `${window.location.origin}${relativePath}`;
    }

    copyLinkToClipboard(url: string): void {
        navigator.clipboard.writeText(url).then(() => {
            this.toast.success('¡Enlace copiado!', '', { timeOut: 2000 });
        }).catch(() => {
            this.toast.error('Error al copiar');
        });
    }

    isClosing = signal(false);

    closeModal(): void {
        this.isClosing.set(true);
        setTimeout(() => {
            this.close.emit();
        }, 150); // Matches CSS animation duration
    }

    onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('comp-overlay')) {
            this.closeModal();
        }
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        // If the click is inside a dropdown container (trigger or menu), do nothing (let the specific handler work)
        // But checking 'contains' might be tricky if one dropdown is open and we click another.
        // Easier: All triggers must stopPropagation().
        // So if this event reaches document, it means it wasn't a trigger.
        // WE JUST CLOSE ALL DROPDOWNS.

        // However, we must ensure that clicking INSIDE the menu doesn't close it if we want to keep it open (usually we close on selection anyway).
        // Let's rely on stopPropagation in usage.

        // Wait, if we click inside the modal (e.g. whitespace), we want to close the dropdown.
        // So yes, simply closing everything here is correct, provided that
        // triggers/menus that SHOULDN'T close consume the event.

        this.openConfigDropdown.set(null);
        this.openDropdownId.set(null);
    }
}
