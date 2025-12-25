import { Component, OnInit, input, output, signal, effect, HostListener, computed, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiClientService } from '../../../../services/api-client.service';
import { ToastrService } from 'ngx-toastr';
import { FilePreviewModalComponent } from '../file-preview-modal/file-preview-modal.component';
import { ShareModalComponent } from '../share-modal/share-modal.component';
import { FileItem, Folder } from '../../../../models/file-item.model';

interface User {
    username: string;
    email?: string;
    is_staff?: boolean;
}

interface Breadcrumb {
    id: number | null;
    name: string;
    folder: Folder | null;
}

interface MoveOption {
    id: number | null;
    name: string;
    depth: number;
}

interface ContextMenu {
    x: number;
    y: number;
    type: 'file' | 'folder' | 'background';
    item?: FileItem | Folder;
}

type SortField = 'name' | 'date' | 'size';
type SortOrder = 'asc' | 'desc';
type FoldersPosition = 'top' | 'mixed';

interface SortConfig {
    field: SortField;
    order: SortOrder;
    foldersPosition: FoldersPosition;
}

@Component({
    selector: 'app-incoming-files',
    imports: [CommonModule, FilePreviewModalComponent, ShareModalComponent],
    templateUrl: './incoming-files.component.html',
    styleUrls: ['../../fileshare.component.css'],
})
export class IncomingFilesComponent implements OnInit {
    // Inyección de dependencias ya está en el constructor

    user = input.required<User | null>();
    refreshTrigger = input<number>(0);
    forceResetCount = input<number>(0);
    scope = input<'all' | 'shared' | 'sent'>('all');

    unreadCountChange = output<number>();

    files = signal<FileItem[]>([]);
    folders = signal<Folder[]>([]);
    currentFolder = signal<Folder | null>(null);
    breadcrumbs = signal<Breadcrumb[]>([{ id: null, name: 'Mi unidad', folder: null }]);

    loading = signal(true);
    isDragging = signal(false);
    uploading = signal(false);
    uploadProgress = signal(0);
    viewMode = signal<'grid' | 'list'>('grid');
    selectedFile = signal<FileItem | null>(null);
    contextMenu = signal<ContextMenu | null>(null);
    moveDialogOpen = signal(false);
    moveDialogLoading = signal(false);
    moveDialogBusy = signal(false);
    moveOptions = signal<MoveOption[]>([]);
    moveTargetFile = signal<FileItem | Folder | null>(null);
    hoveredFolderId = signal<number | null>(null);
    hoveredBreadcrumbKey = signal<string | null>(null);
    animateList = signal(false);
    private dragPreviewElement: HTMLElement | null = null;

    // Selection Mode Signals
    isSelectionMode = signal(false);
    bulkSelectionActive = signal(false); // Controls the visibility of the selection bar at the top
    selectedFileIds = signal<Set<number>>(new Set());
    selectedFolderIds = signal<Set<number>>(new Set());
    private touchTimer: any = null;

    private touchStartTime = 0;

    // Sort Configuration
    sortConfig = signal<SortConfig>({
        field: 'name',
        order: 'asc',
        foldersPosition: 'top'
    });
    isSortMenuOpen = signal(false);

    // Share Modal
    shareModalItem = signal<FileItem | Folder | null>(null);
    shareModalType = signal<'file' | 'folder'>('file');

    // Sorted Computed Lists
    sortedFolders = computed(() => {
        const folders = this.folders();
        const config = this.sortConfig();
        // Clone array to avoid mutating original source
        return [...folders].sort((a, b) => this.compareItems(a, b, 'folder'));
    });

    sortedFiles = computed(() => {
        const files = this.files();
        const config = this.sortConfig();
        return [...files].sort((a, b) => this.compareItems(a, b, 'file'));
    });

    constructor(
        private apiClient: ApiClientService,
        private toastr: ToastrService
    ) {
        // Watch for refresh trigger changes
        effect(() => {
            const trigger = this.refreshTrigger();
            if (trigger > 0) {
                untracked(() => {
                    void this.refreshContent();
                });
            }
        });

        // Guarded scope effect: only act when scope actually changes
        effect(() => {
            const currentScope = this.scope();
            untracked(() => {
                console.log('Scope changed to:', currentScope);
                // Reset navigation when scope changes
                this.clearSelection();
                this.currentFolder.set(null);
                this.resetBreadcrumbs();

                this.hoveredFolderId.set(null);
                this.hoveredBreadcrumbKey.set(null);
                void this.refreshContent();
            });
        });

        // Watch for force reset (clicking the same scope in sidebar)
        effect(() => {
            const resetCount = this.forceResetCount();
            if (resetCount > 0) {
                untracked(() => {
                    this.clearSelection();
                    this.currentFolder.set(null);
                    this.resetBreadcrumbs();
                    void this.refreshContent();
                });
            }
        });

        // Emit unread count changes
        effect(() => {
            const unreadCount = this.files().filter((f) => !f.is_viewed).length;
            this.unreadCountChange.emit(unreadCount);
        });
    }

    ngOnInit(): void {
        // Initial data load handled reactively when scope effect runs
    }


    async refreshContent(): Promise<void> {
        const isInitialLoad = this.files().length === 0 && this.folders().length === 0;
        if (isInitialLoad) {
            this.loading.set(true);
        }
        try {
            await Promise.all([this.fetchFiles(), this.fetchFolders()]);
        } finally {
            this.loading.set(false);
        }
    }

    async fetchFiles(): Promise<void> {
        try {
            const folderId = this.currentFolder()?.id;
            console.debug('[incoming-files] fetchFiles parentId=', folderId);
            const data = await this.apiClient.listFiles(folderId, this.scope());
            // Handle Django REST Framework paginated response
            if (data && data.results && Array.isArray(data.results)) {
                this.files.set(data.results);
            } else if (Array.isArray(data)) {
                this.files.set(data);
            } else {
                this.files.set([]);
            }
        } catch (error) {
            console.error('Error fetching files', error);
            this.files.set([]);
        }
    }

    async fetchFolders(): Promise<void> {
        try {
            const parentId = this.currentFolder()?.id;
            console.debug('[incoming-files] fetchFolders parentId=', parentId);
            const data = await this.apiClient.listFolders(parentId);
            this.folders.set(this.normalizeFolderResponse(data));
        } catch (error) {
            console.error('Error fetching folders', error);
            this.folders.set([]);
        }
    }

    async navigateToFolder(folder: Folder | null, options?: { path?: Breadcrumb[] }): Promise<void> {
        console.log('navigateToFolder called for:', folder?.name);
        if (options?.path) {
            this.breadcrumbs.set(options.path);
        } else if (!folder) {
            this.resetBreadcrumbs();
        } else {
            const currentPath = this.breadcrumbs();
            console.log('Current path before navigation:', currentPath);
            // Build absolute path for breadcrumbs
            try {
                // Build full ancestor chain for the folder so breadcrumbs show the full path
                const fullPath = await this.buildBreadcrumbsForFolder(folder);
                console.debug('[incoming-files] built fullPath:', fullPath);
                this.breadcrumbs.set(fullPath);
                console.log('New path after navigation:', this.breadcrumbs());
            } catch (err) {
                // Fallback: push folder to current path if anything goes wrong
                const newPath = [...currentPath];
                const alreadyInPath = newPath.some(c => c.id === folder.id);
                if (!alreadyInPath) {
                    newPath.push({ id: folder.id, name: folder.name, folder });
                }
                this.breadcrumbs.set(newPath);
                console.warn('Failed to build full breadcrumb path, used fallback', err);
            }
        }

        this.clearSelection();
        this.currentFolder.set(folder);
        console.debug('[incoming-files] currentFolder set to:', this.currentFolder());
        // Trigger enter animation for items
        this.animateList.set(true);
        setTimeout(() => this.animateList.set(false), 800);
        await this.refreshContent();
        console.debug('[incoming-files] after refresh, currentFolder=', this.currentFolder(), 'breadcrumbs=', this.breadcrumbs());
    }

    async handleBreadcrumbClick(index: number): Promise<void> {
        const path = this.breadcrumbs().slice(0, index + 1);
        const target = path[path.length - 1];
        const folder = target?.folder ?? null;
        await this.navigateToFolder(folder, { path });
    }

    closeContextMenu(): void {
        this.contextMenu.set(null);
        this.isSortMenuOpen.set(false);
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (!target.closest('.context-menu') && !target.closest('.optionsBtn')) {
            this.closeContextMenu();
        }
    }

    handleContextMenu(event: MouseEvent, type: 'file' | 'folder' | 'background', item?: FileItem | Folder): void {
        event.preventDefault();
        event.stopPropagation();

        // Don't show context menu if in selection mode (avoids conflict with mobile selection)
        if (this.isSelectionMode()) {
            return;
        }

        // Calculate position to prevent overflow
        let x = event.clientX;
        let y = event.clientY;

        const menuWidth = 200;
        const menuHeight = 250;

        if (typeof window !== 'undefined') {
            if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
            if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
        }

        this.contextMenu.set({
            x,
            y,
            type,
            item
        });
    }

    openPreview(item: any): void {
        this.selectedFile.set(item);
    }

    async createFolder(): Promise<void> {
        const name = prompt('Nombre de la carpeta:');
        if (name) {
            try {
                await this.apiClient.createFolder(name, this.currentFolder()?.id);
                this.toastr.success('Carpeta creada');
                await this.refreshContent();
            } catch (error) {
                this.toastr.error('Error al crear carpeta');
            }
        }
    }

    async renameItem(): Promise<void> {
        const menu = this.contextMenu();
        if (!menu || !menu.item) return;

        const newName = prompt('Nuevo nombre:', 'filename' in menu.item ? menu.item.filename : menu.item.name);
        if (!newName) return;

        try {
            if (menu.type === 'folder') {
                await this.apiClient.renameFolder(menu.item.id, newName);
                this.fetchFolders();
            } else {
                // File rename not implemented in backend yet, maybe later
                this.toastr.info('Renombrar archivos no implementado aún');
            }
        } catch (error) {
            this.toastr.error('Error al renombrar');
        }
    }

    async deleteItem(): Promise<void> {
        const menu = this.contextMenu();
        if (!menu || !menu.item) return;

        if (!confirm('¿Estás seguro de eliminar este elemento?')) return;

        const itemId = Number(menu.item.id);
        const itemType = menu.type;

        console.log(`[Fileshare] Deleting ${itemType} with ID ${itemId}`);

        // Optimistic update: remove from local state immediately
        if (itemType === 'folder') {
            this.folders.update(fs => fs.filter(f => Number(f.id) !== itemId));
        } else {
            this.files.update(fs => fs.filter(f => Number(f.id) !== itemId));
        }
        this.clearSelection();

        try {
            if (itemType === 'folder') {
                await this.apiClient.deleteFolder(itemId);
            } else {
                await this.apiClient.deleteFile(itemId);
            }
            this.toastr.success('Elemento eliminado');
            // Small delay before refresh to ensure backend has finished processing
            setTimeout(() => this.refreshContent(), 500);
        } catch (error) {
            this.toastr.error('Error al eliminar');
            // On error, refresh to restore state
            await this.refreshContent();
        }
    }

    async handleFolderDownload(folder: Folder): Promise<void> {
        try {
            const downloadToast = this.toastr.info('Descargando carpeta...', '', {
                disableTimeOut: true,
            });

            const blob = await this.apiClient.downloadFolder(folder.id);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${folder.name}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            this.toastr.clear(downloadToast.toastId);
            this.toastr.success('Carpeta descargada correctamente');
        } catch (error) {
            console.error('Folder download failed', error);
            this.toastr.error('Error al descargar la carpeta');
        }
    }

    openShareModal(item: FileItem | Folder, type: 'file' | 'folder'): void {
        this.shareModalItem.set(item);
        this.shareModalType.set(type);
        this.closeContextMenu(); // Close context menu if open
    }

    closeShareModal(): void {
        this.shareModalItem.set(null);
    }

    isMobile(): boolean {
        if (typeof window === 'undefined') return false;
        return window.innerWidth <= 768;
    }

    handleItemClick(event: MouseEvent, type: 'file' | 'folder', item: FileItem | Folder): void {
        event.stopPropagation();

        if (this.isMobile()) return;

        // PC Logic: Single click selects (highlights), Double click (handled by (dblclick)) enters.
        // User wants "total" selection via checkbox.
        // We'll treat card click as a single item selection/highlight.
        // If this click is actually part of a double-click, handle navigation immediately
        const detail = (event as MouseEvent).detail || 1;
        if (detail === 2 && type === 'folder') {
            // Double click (two rapid clicks) — navigate into folder
            this.navigateToFolder(item as Folder).catch(err => console.error('navigate error', err));
            return;
        }

        if (this.isSelectionMode()) {
            this.toggleItemSelection(type, item);
        } else {
            this.clearSelection();
            this.toggleItemSelection(type, item);
        }
    }

    @HostListener('document:mousedown', ['$event'])
    onDocumentMouseDown(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        // Close context menu if clicked outside of it or outside options button
        if (!target.closest('.context-menu') && !target.closest('.optionsBtn')) {
            this.closeContextMenu();
        }
    }

    /**
     * Build breadcrumb array from the root to the provided folder by walking parents.
     */
    private async buildBreadcrumbsForFolder(folder: Folder): Promise<Breadcrumb[]> {
        const crumbs: Breadcrumb[] = [{ id: null, name: this.getScopeRootLabel(), folder: null }];
        try {
            // Collect ancestors up to root
            const stack: Folder[] = [];
            let current: Folder | null = folder;
            while (current) {
                stack.push(current);
                if (current.parent == null) break;
                // Fetch parent folder details
                // Use apiClient.getFolder which we added to the service
                // If API fails, break and fallback
                // eslint-disable-next-line no-await-in-loop
                try {
                    // parent may be null/undefined; api may throw if not found
                    // eslint-disable-next-line no-await-in-loop
                    const parentData = await this.apiClient.getFolder(current.parent as number);
                    if (!parentData) break;
                    current = parentData as Folder;
                } catch (err) {
                    console.warn('[incoming-files] failed to fetch parent folder', current.parent, err);
                    break;
                }
            }

            // stack currently has [folder, parent, grandparent...] — reverse to root-first
            stack.reverse();
            console.debug('[incoming-files] ancestor stack reversed:', stack);
            stack.forEach(f => crumbs.push({ id: f.id, name: f.name, folder: f }));
        } catch (error) {
            console.error('Error building breadcrumbs for folder', error);
            // In case of error, push the single folder at least
            crumbs.push({ id: folder.id, name: folder.name, folder });
        }
        return crumbs;
    }

    handleItemTouchStart(event: TouchEvent): void {
        this.touchStartTime = Date.now();
        this.touchTimer = setTimeout(() => {
            // Long-press detected - trigger selection
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
    }

    handleItemTouchEnd(event: TouchEvent, type: 'file' | 'folder', item: FileItem | Folder): void {
        clearTimeout(this.touchTimer);
        const duration = Date.now() - this.touchStartTime;

        if (duration >= 500) {
            // Long-press: Toggle selection
            if (event.cancelable) event.preventDefault();
            this.toggleItemSelection(type, item);
        } else if (this.isSelectionMode()) {
            // In selection mode: Toggle selection on tap
            if (event.cancelable) event.preventDefault();
            this.toggleItemSelection(type, item);
        } else if (type === 'folder' && duration < 300) {
            // Short tap on folder: Navigate
            if (event.cancelable) event.preventDefault();
            this.navigateToFolder(item as Folder);
        }
    }

    toggleItemSelection(type: 'file' | 'folder', item: FileItem | Folder, isBulk: boolean = false): void {
        const id = item.id;
        if (type === 'file') {
            this.selectedFileIds.update(set => {
                const newSet = new Set(set);
                if (newSet.has(id)) newSet.delete(id);
                else newSet.add(id);
                return newSet;
            });
        } else {
            this.selectedFolderIds.update(set => {
                const newSet = new Set(set);
                if (newSet.has(id)) newSet.delete(id);
                else newSet.add(id);
                return newSet;
            });
        }

        const selectedCount = this.selectedFileIds().size + this.selectedFolderIds().size;
        this.isSelectionMode.set(selectedCount > 0);

        // If we used the checkbox OR have multiple items, active bulk mode
        if (isBulk || selectedCount > 1) {
            this.bulkSelectionActive.set(true);
        } else if (selectedCount === 0) {
            this.bulkSelectionActive.set(false);
        }
    }

    clearSelection(): void {
        this.selectedFileIds.set(new Set());
        this.selectedFolderIds.set(new Set());
        this.isSelectionMode.set(false);
        this.bulkSelectionActive.set(false);
    }

    isFileSelected(id: number): boolean {
        return this.selectedFileIds().has(id);
    }

    isFolderSelected(id: number): boolean {
        return this.selectedFolderIds().has(id);
    }

    async handleFileDrop(event: DragEvent, targetFolder: Folder): Promise<void> {
        event.preventDefault();
        event.stopPropagation();
        this.hoveredFolderId.set(null);

        const fileId = event.dataTransfer?.getData('application/json');
        if (fileId) {
            // Internal move
            try {
                await this.apiClient.moveFileToFolder(parseInt(fileId), targetFolder.id);
                this.toastr.success(`Movido a ${targetFolder.name}`);
                await this.refreshContent();
            } catch (error) {
                this.toastr.error('Error al mover archivo');
            }
        }
    }

    handleFolderDragOver(event: DragEvent, folder: Folder): void {
        if (!this.isInternalFileDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        if (this.hoveredFolderId() !== folder.id) {
            this.hoveredFolderId.set(folder.id);
        }
    }

    handleDragStart(event: DragEvent, file: FileItem): void {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return;

        dataTransfer.setData('application/json', file.id.toString());
        dataTransfer.effectAllowed = 'move';

        this.createDragPreview(dataTransfer, file, event.target as HTMLElement);
    }

    handleDragEnd(): void {
        if (this.dragPreviewElement) {
            document.body.removeChild(this.dragPreviewElement);
            this.dragPreviewElement = null;
        }
        this.hoveredFolderId.set(null);
        this.hoveredBreadcrumbKey.set(null);
    }

    async markAsViewed(fileId: number): Promise<void> {
        // Optimistic update
        this.files.update((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, is_viewed: true } : f))
        );

        try {
            await this.apiClient.markFileViewed(fileId);
        } catch (error) {
            console.error('Failed to mark as viewed', error);
            // Revert on error
            this.files.update((prev) =>
                prev.map((f) => (f.id === fileId ? { ...f, is_viewed: false } : f))
            );
        }
    }

    handleFileClick(file: FileItem): void {
        if (!file.is_viewed) {
            this.markAsViewed(file.id);
        }
        this.selectedFile.set(file);
    }

    handleFileHover(file: FileItem): void {
        if (this.viewMode() === 'grid' && !file.is_viewed) {
            this.markAsViewed(file.id);
        }
    }

    handleDragEnter(event: DragEvent): void {
        event.preventDefault();
        this.isDragging.set(this.isExternalDrag(event));
    }

    handleDragOver(event: DragEvent): void {
        event.preventDefault();
        this.isDragging.set(this.isExternalDrag(event));
    }

    handleDragLeave(event: DragEvent): void {
        event.preventDefault();
        this.isDragging.set(false);
    }

    async handleDrop(event: DragEvent): Promise<void> {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(false);
        this.hoveredFolderId.set(null);
        this.hoveredBreadcrumbKey.set(null);

        const fileId = event.dataTransfer?.getData('application/json');
        if (fileId) {
            try {
                await this.apiClient.moveFileToFolder(parseInt(fileId, 10), this.currentFolder()?.id ?? null);
                this.toastr.success('Archivo movido correctamente');
                await this.refreshContent();
            } catch (error) {
                this.toastr.error('Error al mover archivo');
            }
            return;
        }

        const droppedFiles = event.dataTransfer?.files;
        if (droppedFiles && droppedFiles.length > 0 && this.user()) {
            await this.handleUpload(droppedFiles[0]);
        }
    }

    async handleUpload(file: File): Promise<void> {
        this.uploading.set(true);
        this.uploadProgress.set(0);
        const uploadToastId = this.toastr.info(`Subiendo ${file.name}... 0%`, '', {
            disableTimeOut: true,
            closeButton: false,
        });

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('recipient_username', this.user()!.username);

            if (this.currentFolder()) {
                formData.append('folder', this.currentFolder()!.id.toString());
            }

            await this.apiClient.uploadFile(formData, (progressEvent: any) => {
                const percentCompleted = Math.round(
                    (progressEvent.loaded * 100) / progressEvent.total
                );
                this.uploadProgress.set(percentCompleted);
                this.toastr.clear(uploadToastId.toastId);
                this.toastr.info(`Subiendo ${file.name}... ${percentCompleted}%`, '', {
                    disableTimeOut: true,
                    closeButton: false,
                });
            });

            this.toastr.clear(uploadToastId.toastId);
            this.toastr.success('Archivo subido correctamente');
            this.uploadProgress.set(0);
            await this.refreshContent();
        } catch (error: any) {
            console.error('Upload failed', error);
            let errorMessage = 'Error al subir el archivo';
            if (error.payload && error.payload.file) {
                errorMessage = error.payload.file;
            } else if (error.message) {
                errorMessage = error.message;
            }

            this.toastr.clear(uploadToastId.toastId);
            this.toastr.error(errorMessage);
            this.uploadProgress.set(0);
        } finally {
            this.uploading.set(false);
        }
    }

    async handleDownload(id: number, filename: string): Promise<void> {
        try {
            const ext = '.' + filename.split('.').pop()?.toLowerCase();
            const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];

            if (archiveExts.includes(ext)) {
                const archiveInfo = await this.apiClient.checkArchive(id);

                if (archiveInfo.has_executables) {
                    const executableList = archiveInfo.executable_files
                        .slice(0, 5)
                        .join(', ');
                    const moreCount =
                        archiveInfo.executable_files.length > 5
                            ? ` y ${archiveInfo.executable_files.length - 5} más`
                            : '';

                    const confirmed = await this.showMalwareWarning(
                        executableList,
                        moreCount
                    );
                    if (!confirmed) {
                        this.toastr.error('Descarga cancelada por seguridad', '', {
                            progressBar: true,
                        });
                        return;
                    }
                }
            }

            const downloadToastId = this.toastr.info('Descargando archivo...', '', {
                disableTimeOut: true,
            });

            const blob = await this.apiClient.downloadFile(id);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            this.toastr.clear(downloadToastId.toastId);
            this.toastr.success('Archivo descargado correctamente');
        } catch (error) {
            console.error('Download failed', error);
            this.toastr.error('Error al descargar el archivo');
        }
    }

    private showMalwareWarning(
        executableList: string,
        moreCount: string
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const warningToast = this.toastr.warning(
                `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="font-weight: bold; font-size: 15px; display: flex; align-items: center; gap: 8px;">
            <span>⚠️</span>
            <span>ADVERTENCIA DE SEGURIDAD</span>
          </div>
          <div style="font-size: 13px; line-height: 1.5;">
            Este archivo contiene ejecutables peligrosos:
            <div style="margin-top: 8px; padding: 8px; background: rgba(255, 0, 0, 0.1); border-radius: 4px; font-family: monospace; font-size: 12px;">
              ${executableList}${moreCount}
            </div>
          </div>
          <div style="font-size: 12px; opacity: 0.8;">
            Los archivos .exe, .bat, .sh pueden contener malware
          </div>
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button id="confirm-download" style="flex: 1; padding: 8px 16px; background: linear-gradient(135deg, #FFB800 0%, #FF8800 100%); border: none; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; font-size: 13px;">Descargar de todos modos</button>
            <button id="cancel-download" style="flex: 1; padding: 8px 16px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: white; cursor: pointer; font-size: 13px;">Cancelar</button>
          </div>
        </div>
      `,
                '',
                {
                    disableTimeOut: true,
                    closeButton: false,
                    enableHtml: true,
                }
            );

            setTimeout(() => {
                const confirmBtn = document.getElementById('confirm-download');
                const cancelBtn = document.getElementById('cancel-download');

                if (confirmBtn) {
                    confirmBtn.onclick = () => {
                        this.toastr.clear(warningToast.toastId);
                        resolve(true);
                    };
                }

                if (cancelBtn) {
                    cancelBtn.onclick = () => {
                        this.toastr.clear(warningToast.toastId);
                        resolve(false);
                    };
                }
            }, 100);
        });
    }

    handleDelete(fileId: number): void {
        const confirmToast = this.toastr.info(
            `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="font-weight: bold; font-size: 15px;">¿Eliminar archivo?</div>
        <div style="font-size: 13px; opacity: 0.9;">Esta acción no se puede deshacer</div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button id="confirm-delete-${fileId}" style="flex: 1; padding: 8px 16px; background: linear-gradient(135deg, #FF3366 0%, #CC0044 100%); border: none; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; font-size: 13px;">Eliminar</button>
          <button id="cancel-delete-${fileId}" style="flex: 1; padding: 8px 16px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: white; cursor: pointer; font-size: 13px;">Cancelar</button>
        </div>
      </div>
    `,
            '',
            {
                disableTimeOut: true,
                closeButton: false,
                enableHtml: true,
            }
        );

        setTimeout(() => {
            const confirmBtn = document.getElementById(`confirm-delete-${fileId}`);
            const cancelBtn = document.getElementById(`cancel-delete-${fileId}`);

            if (confirmBtn) {
                confirmBtn.onclick = () => {
                    this.toastr.clear(confirmToast.toastId);
                    this.performDelete(fileId);
                };
            }

            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    this.toastr.clear(confirmToast.toastId);
                };
            }
        }, 100);
    }

    async performDelete(fileId: number): Promise<void> {
        const idToDelete = Number(fileId);
        const deleteToast = this.toastr.info('Eliminando archivo...', '', {
            disableTimeOut: true,
        });

        console.log(`[Fileshare] performDelete for ID ${idToDelete}`);

        // Optimistic update: remove from local state immediately
        this.files.update(fs => fs.filter(f => Number(f.id) !== idToDelete));
        this.selectedFile.set(null);
        this.clearSelection();

        try {
            await this.apiClient.deleteFile(fileId);
            this.toastr.clear(deleteToast.toastId);
            this.toastr.success('Archivo eliminado correctamente');

            // Small delay before refresh
            setTimeout(() => this.refreshContent(), 500);
        } catch (error) {
            this.toastr.error('Error al eliminar el archivo');
            this.toastr.clear(deleteToast.toastId);
            // Revert state on error
            await this.refreshContent();
        }
    }

    isImage(filename: string): boolean {
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
    }

    getFileUrl(fileId: number): string {
        return `http://localhost:8000/api/transfers/${fileId}/download/`;
    }

    closeModal(): void {
        this.selectedFile.set(null);
    }

    private isExternalDrag(event: DragEvent): boolean {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return false;

        const types = Array.from(dataTransfer.types || []);
        if (types.includes('Files')) {
            return true;
        }

        const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
        return items.some((item) => item.kind === 'file');
    }

    private isInternalFileDrag(event: DragEvent): boolean {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return false;
        const types = Array.from(dataTransfer.types || []);
        return types.includes('application/json');
    }

    handleFolderDragEnter(event: DragEvent, folder: Folder): void {
        if (!this.isInternalFileDrag(event)) return;
        event.preventDefault();
        this.hoveredFolderId.set(folder.id);
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
    }

    handleFolderDragLeave(event: DragEvent, folder: Folder): void {
        event.preventDefault();
        const currentTarget = event.currentTarget as Node | null;
        const related = event.relatedTarget as Node | null;

        if (currentTarget && related && currentTarget.contains(related)) {
            return;
        }

        if (this.hoveredFolderId() === folder.id) {
            this.hoveredFolderId.set(null);
        }
    }

    handleBreadcrumbDragEnter(event: DragEvent, crumb: Breadcrumb): void {
        if (!this.isInternalFileDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        this.hoveredBreadcrumbKey.set(this.breadcrumbKey(crumb));
    }

    handleBreadcrumbDragOver(event: DragEvent, crumb: Breadcrumb): void {
        if (!this.isInternalFileDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        if (this.hoveredBreadcrumbKey() !== this.breadcrumbKey(crumb)) {
            this.hoveredBreadcrumbKey.set(this.breadcrumbKey(crumb));
        }
    }

    handleBreadcrumbDragLeave(event: DragEvent, crumb: Breadcrumb): void {
        if (!this.isInternalFileDrag(event)) return;
        event.preventDefault();

        const currentTarget = event.currentTarget as Node | null;
        const related = event.relatedTarget as Node | null;

        if (currentTarget && related && currentTarget.contains(related)) {
            return;
        }

        const key = this.breadcrumbKey(crumb);
        if (this.hoveredBreadcrumbKey() === key) {
            this.hoveredBreadcrumbKey.set(null);
        }
    }

    async handleBreadcrumbDrop(event: DragEvent, crumb: Breadcrumb): Promise<void> {
        if (!this.isInternalFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();

        const fileId = event.dataTransfer?.getData('application/json');
        this.hoveredBreadcrumbKey.set(null);

        if (!fileId) {
            return;
        }

        const targetFolderId = crumb.id ?? null;

        try {
            await this.apiClient.moveFileToFolder(parseInt(fileId, 10), targetFolderId);
            const destinationName = crumb.name;
            this.toastr.success(`Movido a ${destinationName}`);
            await this.refreshContent();
        } catch (error) {
            this.toastr.error('Error al mover archivo');
        }
    }

    breadcrumbKey(crumb: Breadcrumb): string {
        return crumb.id === null ? 'root' : crumb.id.toString();
    }

    async openMoveDialog(item: FileItem | Folder): Promise<void> {
        if (!this.canMoveItem(item)) {
            this.toastr.info('No puedes mover este elemento desde esta vista');
            return;
        }
        this.moveTargetFile.set(item);
        this.moveDialogOpen.set(true);
        this.moveDialogLoading.set(true);
        this.moveOptions.set([]);

        try {
            const tree = await this.fetchFolderTree();
            const options = this.buildMoveOptions(tree);
            this.moveOptions.set(options);
        } catch (error) {
            console.error('Failed to load folders for move dialog', error);
            this.toastr.error('No se pudieron cargar las carpetas');
        } finally {
            this.moveDialogLoading.set(false);
        }
    }

    closeMoveDialog(): void {
        if (this.moveDialogBusy()) return;
        this.moveDialogOpen.set(false);
        this.moveOptions.set([]);
        this.moveTargetFile.set(null);
    }

    async confirmMove(targetFolderId: number | null): Promise<void> {
        const item = this.moveTargetFile();
        if (!item || this.moveDialogBusy()) return;

        // Verificar si es un archivo o carpeta
        if ('filename' in item) {
            // Es un FileItem
            if ((item.folder ?? null) === targetFolderId) {
                this.toastr.info('El archivo ya está en esa carpeta');
                return;
            }

            this.moveDialogBusy.set(true);

            try {
                await this.apiClient.moveFileToFolder(item.id, targetFolderId);
                this.toastr.success('Archivo movido correctamente');
                await this.refreshContent();
                this.closeMoveDialog();
            } catch (error) {
                console.error('Error moving file:', error);
                this.toastr.error('Error al mover el archivo');
            } finally {
                this.moveDialogBusy.set(false);
            }
        } else {
            // Es una carpeta
            this.moveDialogBusy.set(true);

            try {
                // Para carpetas, necesitamos implementar moveFolderToFolder si existe
                // o modificar el backend para manejar carpetas también con moveFileToFolder
                // Por ahora, mostramos un mensaje de error
                throw new Error('Mover carpetas no está implementado aún');

                this.toastr.success('Carpeta movida correctamente');
                await this.refreshContent();
                this.closeMoveDialog();
            } catch (error) {
                console.error('Error moving folder:', error);
                this.toastr.error('Error al mover la carpeta: ' + (error instanceof Error ? error.message : 'Error desconocido'));
            } finally {
                this.moveDialogBusy.set(false);
            }
        }
    }

    moveTargetDisplayName(): string {
        const item = this.moveTargetFile();
        if (!item) {
            return '';
        }

        return 'filename' in item ? item.filename : item.name;
    }

    moveTargetFolderId(): number | null {
        const item = this.moveTargetFile();
        if (item && 'filename' in item) {
            return item.folder ?? null;
        }
        return null;
    }

    isMoveOptionActive(optionId: number | null): boolean {
        return this.moveTargetFolderId() === optionId;
    }

    canMoveItem(item: FileItem | Folder): boolean {
        if (!('filename' in item)) {
            return true;
        }

        const currentUser = this.user();
        if (!currentUser) {
            return false;
        }

        if (this.scope() === 'sent') {
            return false;
        }

        if (this.scope() === 'all' && item.sender_username && item.sender_username === currentUser.username) {
            return false;
        }

        return true;
    }

    isSentScope(): boolean {
        return this.scope() === 'sent';
    }

    private normalizeFolderResponse(data: any): Folder[] {
        if (Array.isArray(data)) {
            return data;
        }

        if (data && Array.isArray(data.results)) {
            return data.results;
        }

        return [];
    }

    private resetBreadcrumbs(): void {
        const rootLabel = this.getScopeRootLabel();
        console.log('Resetting breadcrumbs to root:', rootLabel);
        this.breadcrumbs.set([{ id: null, name: rootLabel, folder: null }]);
    }

    getScopeRootLabel(): string {
        switch (this.scope()) {
            case 'shared': return 'Compartidos';
            case 'sent': return 'Enviados';
            default: return 'Mi unidad';
        }
    }

    private async fetchFolderTree(): Promise<Record<string, Folder[]>> {
        const tree: Record<string, Folder[]> = {};
        const visited = new Set<number | null>();
        const queue: Array<number | null> = [null];

        while (queue.length > 0) {
            const parentId = queue.shift()!;
            if (visited.has(parentId)) {
                continue;
            }

            visited.add(parentId);

            try {
                const response = await this.apiClient.listFolders(parentId ?? undefined);
                const folders = this.normalizeFolderResponse(response);
                const key = parentId === null ? 'root' : parentId.toString();
                tree[key] = folders;

                folders.forEach((folder) => {
                    if (!visited.has(folder.id)) {
                        queue.push(folder.id);
                    }
                });
            } catch (error) {
                console.error('Error fetching folder tree', error);
                const key = parentId === null ? 'root' : parentId.toString();
                tree[key] = [];
            }
        }

        return tree;
    }

    private buildMoveOptions(tree: Record<string, Folder[]>): MoveOption[] {
        const options: MoveOption[] = [{ id: null, name: 'Mis Archivos', depth: 0 }];

        const traverse = (parentId: number | null, depth: number) => {
            const key = parentId === null ? 'root' : parentId.toString();
            const children = tree[key] || [];

            children.forEach((folder) => {
                options.push({ id: folder.id, name: folder.name, depth });
                traverse(folder.id, depth + 1);
            });
        };

        traverse(null, 1);
        return options;
    }

    private createDragPreview(dataTransfer: DataTransfer, file: FileItem, target: HTMLElement): void {
        if (this.dragPreviewElement) {
            document.body.removeChild(this.dragPreviewElement);
        }

        const preview = document.createElement('div');
        preview.className = 'dragPreview';
        preview.style.display = 'flex';
        preview.style.alignItems = 'center';
        preview.style.gap = '0.75rem';
        preview.style.padding = '0.55rem 0.85rem';
        preview.style.background = 'rgba(0, 0, 0, 0.6)';
        preview.style.borderRadius = '9px';
        preview.style.border = '1px solid rgba(0, 242, 255, 0.25)';
        preview.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.35)';
        preview.style.pointerEvents = 'none';
        preview.style.backdropFilter = 'blur(4px)';
        preview.style.color = '#fff';
        preview.style.fontSize = '0.9rem';
        preview.style.maxWidth = '260px';
        preview.style.overflow = 'hidden';
        preview.style.opacity = '0.85';

        if (this.isImage(file.filename)) {
            const img = document.createElement('img');
            img.src = this.getFileUrl(file.id);
            img.alt = file.filename;
            img.style.width = '100px';
            img.style.height = '100px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '8px';
            img.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            preview.appendChild(img);
        } else {
            const icon = document.createElement('div');
            icon.className = 'dragPreviewIcon';
            icon.textContent = '📄';
            icon.style.fontSize = '2.2rem';
            preview.appendChild(icon);
        }

        const label = document.createElement('span');
        label.className = 'dragPreviewLabel';
        label.textContent = file.filename;
        label.style.flex = '1';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        preview.appendChild(label);

        document.body.appendChild(preview);

        const rect = preview.getBoundingClientRect();
        const offsetX = rect.width / 2;
        const offsetY = rect.height / 2;
        dataTransfer.setDragImage(preview, offsetX, offsetY);

        this.dragPreviewElement = preview;

    }

    @HostListener('document:click')
    closeSortMenu() {
        this.isSortMenuOpen.set(false);
    }

    toggleSortMenu() {
        this.isSortMenuOpen.update(v => !v);
    }

    setSortConfig(config: Partial<SortConfig>) {
        this.sortConfig.update(current => ({ ...current, ...config }));
    }

    getSortLabel(): string {
        const field = this.sortConfig().field;
        switch (field) {
            case 'name': return 'Nombre';
            case 'date': return 'Fecha';
            case 'size': return 'Tamaño';
            default: return 'Ordenar';
        }
    }

    compareItems(a: FileItem | Folder, b: FileItem | Folder, type: 'file' | 'folder'): number {
        const config = this.sortConfig();
        let result = 0;

        switch (config.field) {
            case 'name':
                const nameA = (a as Folder).name || (a as FileItem).filename || '';
                const nameB = (b as Folder).name || (b as FileItem).filename || '';
                result = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
                break;
            case 'size':
                if (type === 'file') {
                    result = (a as FileItem).size - (b as FileItem).size;
                } else {
                    result = 0; // Folders don't have size currently, treat as equal
                }
                break;
            case 'date':
                const dateA = new Date(a.created_at).getTime();
                const dateB = new Date(b.created_at).getTime();
                result = dateA - dateB;
                break;
        }

        return config.order === 'asc' ? result : -result;
    }

    /**
     * Dispara el diálogo de selección de archivos
     */
    triggerFileUpload(): void {
        // Simplemente activa el input de archivo oculto
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) {
            fileInput.click();
        }
    }

    /**
     * Maneja la selección de archivos a través del input de tipo file
     */
    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const files = Array.from(input.files);

            // Subir archivos secuencialmente para manejar mejor el progreso y la carpeta destino
            const uploadPromises = files.map(file => this.handleUpload(file));

            Promise.all(uploadPromises).then(() => {
                // refreshContent ya se llama en cada handleUpload satisfactorio
                if (input) {
                    input.value = '';
                }
            }).catch((error) => {
                console.error('Error en carga por lotes:', error);
            });
        }
    }
}
