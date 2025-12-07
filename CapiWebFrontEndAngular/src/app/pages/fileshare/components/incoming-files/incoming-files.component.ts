import { Component, OnInit, input, output, signal, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiClientService } from '../../../../services/api-client.service';
import { ToastrService } from 'ngx-toastr';
import { FilePreviewModalComponent } from '../file-preview-modal/file-preview-modal.component';

interface User {
    username: string;
    email?: string;
    is_staff?: boolean;
}

interface FileItem {
    id: number;
    filename: string;
    size: number;
    created_at: string;
    is_viewed: boolean;
    sender_username?: string;
    recipient_username?: string;
    folder?: number | null;
}

interface Folder {
    id: number;
    name: string;
    owner: number;
    parent: number | null;
    created_at: string;
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

@Component({
    selector: 'app-incoming-files',
    imports: [CommonModule, FilePreviewModalComponent],
    templateUrl: './incoming-files.component.html',
    styleUrls: ['../../fileshare.component.css'],
})
export class IncomingFilesComponent implements OnInit {
    user = input.required<User | null>();
    refreshTrigger = input<number>(0);

    unreadCountChange = output<number>();

    files = signal<FileItem[]>([]);
    folders = signal<Folder[]>([]);
    currentFolder = signal<Folder | null>(null);
    private readonly rootBreadcrumb: Breadcrumb = { id: null, name: 'Mis Archivos', folder: null };
    breadcrumbs = signal<Breadcrumb[]>([this.rootBreadcrumb]);

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
    moveTargetFile = signal<FileItem | null>(null);
    hoveredFolderId = signal<number | null>(null);
    hoveredBreadcrumbKey = signal<string | null>(null);
    private dragPreviewElement: HTMLElement | null = null;

    constructor(
        private apiClient: ApiClientService,
        private toastr: ToastrService
    ) {
        // Watch for refresh trigger changes
        effect(() => {
            const trigger = this.refreshTrigger();
            if (trigger > 0) {
                this.refreshContent();
            }
        });

        // Emit unread count changes
        effect(() => {
            const unreadCount = this.files().filter((f) => !f.is_viewed).length;
            this.unreadCountChange.emit(unreadCount);
        });
    }

    ngOnInit(): void {
        this.refreshContent();
    }

    @HostListener('document:click')
    closeContextMenu(): void {
        this.contextMenu.set(null);
    }

    async refreshContent(): Promise<void> {
        this.loading.set(true);
        try {
            await Promise.all([this.fetchFiles(), this.fetchFolders()]);
        } finally {
            this.loading.set(false);
        }
    }

    async fetchFiles(): Promise<void> {
        try {
            const folderId = this.currentFolder()?.id;
            const data = await this.apiClient.listFiles(folderId);
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
            const data = await this.apiClient.listFolders(parentId);
            this.folders.set(this.normalizeFolderResponse(data));
        } catch (error) {
            console.error('Error fetching folders', error);
            this.folders.set([]);
        }
    }

    async navigateToFolder(folder: Folder | null, options?: { path?: Breadcrumb[] }): Promise<void> {
        if (options?.path) {
            this.breadcrumbs.set(options.path);
        } else if (!folder) {
            this.breadcrumbs.set([this.rootBreadcrumb]);
        } else {
            const currentPath = this.breadcrumbs();
            const lastCrumb = currentPath[currentPath.length - 1];
            if (!lastCrumb || lastCrumb.id !== folder.id) {
                this.breadcrumbs.set([...currentPath, { id: folder.id, name: folder.name, folder }]);
            }
        }

        this.currentFolder.set(folder);
        await this.refreshContent();
    }

    async handleBreadcrumbClick(index: number): Promise<void> {
        const path = this.breadcrumbs().slice(0, index + 1);
        const target = path[path.length - 1];
        const folder = target?.folder ?? null;
        await this.navigateToFolder(folder, { path });
    }

    handleContextMenu(event: MouseEvent, type: 'file' | 'folder' | 'background', item?: FileItem | Folder): void {
        event.preventDefault();
        event.stopPropagation();
        this.contextMenu.set({
            x: event.clientX,
            y: event.clientY,
            type,
            item
        });
    }

    async createFolder(): Promise<void> {
        const name = prompt('Nombre de la carpeta:');
        if (name) {
            try {
                await this.apiClient.createFolder(name, this.currentFolder()?.id);
                this.toastr.success('Carpeta creada');
                this.fetchFolders();
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

        try {
            if (menu.type === 'folder') {
                await this.apiClient.deleteFolder(menu.item.id);
                this.fetchFolders();
            } else {
                await this.apiClient.deleteFile(menu.item.id);
                this.fetchFiles();
            }
            this.toastr.success('Elemento eliminado');
        } catch (error) {
            this.toastr.error('Error al eliminar');
        }
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
                this.refreshContent();
            } catch (error) {
                this.toastr.error('Error al mover archivo');
            }
        } else {
            // External upload to folder
            // We need to handle this in handleDrop but passing folder context
            // For now, handleDrop uses currentFolder implicitly if we update handleUpload
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
                formData.append('folder_id', this.currentFolder()!.id.toString());
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
        const deleteToast = this.toastr.info('Eliminando archivo...', '', {
            disableTimeOut: true,
        });

        try {
            await this.apiClient.deleteFile(fileId);
            this.toastr.clear(deleteToast.toastId);
            this.toastr.success('Archivo eliminado correctamente');
            await this.refreshContent();
            this.selectedFile.set(null);
        } catch (error) {
            console.error('Delete failed', error);
            this.toastr.clear(deleteToast.toastId);
            this.toastr.error('Error al eliminar el archivo');
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

    async openMoveDialog(file: FileItem): Promise<void> {
        this.moveTargetFile.set(file);
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
        const file = this.moveTargetFile();
        if (!file || this.moveDialogBusy()) return;

        if ((file.folder ?? null) === targetFolderId) {
            this.toastr.info('El archivo ya está en esa carpeta');
            return;
        }

        this.moveDialogBusy.set(true);
        try {
            await this.apiClient.moveFileToFolder(file.id, targetFolderId);
            this.toastr.success('Archivo movido correctamente');
            this.closeMoveDialog();
            await this.refreshContent();
        } catch (error) {
            console.error('Failed to move file', error);
            this.toastr.error('Error al mover archivo');
        } finally {
            this.moveDialogBusy.set(false);
        }
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
}
