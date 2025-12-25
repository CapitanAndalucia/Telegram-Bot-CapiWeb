import { Component, EventEmitter, Input, Output, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../../../services/api-client.service';
import { FileItem, Folder } from '../../../../models/file-item.model';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'app-share-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './share-modal.component.html',
    styleUrls: ['./share-modal.component.css']
})
export class ShareModalComponent {
    @Input() item!: FileItem | Folder;
    @Input() type!: 'file' | 'folder';
    @Output() close = new EventEmitter<void>();
    @Output() shared = new EventEmitter<void>();

    private api = inject(ApiClientService);
    private toast = inject(ToastrService);

    searchQuery = signal('');
    searchResults = signal<any[]>([]);
    friends = signal<any[]>([]);
    selectedUser = signal<any>(null);
    isLoading = signal(false);
    isSharing = signal(false);

    constructor() {
        // Load friends initially
        this.loadFriends();
    }

    async loadFriends() {
        try {
            const friends = await this.api.listFriends();
            this.friends.set(friends);
        } catch (error) {
            console.error('Error loading friends', error);
        }
    }

    async onSearch() {
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

    selectUser(user: any) {
        this.selectedUser.set(user);
        this.searchQuery.set(user.username);
        this.searchResults.set([]); // Clear results after selection
    }

    async share() {
        const user = this.selectedUser();
        if (!user) {
            this.toast.error('Selecciona un usuario primero');
            return;
        }

        this.isSharing.set(true);
        try {
            if (this.type === 'file') {
                await this.api.shareFile(this.item.id, user.username);
            } else {
                await this.api.shareFolder(this.item.id, user.username);
            }
            this.toast.success(`Compartido con ${user.username}`);
            this.shared.emit();
            this.close.emit();
        } catch (error: any) {
            this.toast.error(error.message || 'Error al compartir');
        } finally {
            this.isSharing.set(false);
        }
    }

    onBackdropClick(event: MouseEvent) {
        if ((event.target as HTMLElement).classList.contains('comp-overlay')) {
            this.close.emit();
        }
    }
}
