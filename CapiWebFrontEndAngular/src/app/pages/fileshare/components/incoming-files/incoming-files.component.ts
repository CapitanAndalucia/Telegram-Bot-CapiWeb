import { Component, signal, computed, effect, inject, ChangeDetectorRef, HostListener, OnInit, input, output, untracked } from '@angular/core';
import { UploadService } from '../../../../shared/services/upload.service';
import { CommonModule } from '@angular/common';
import { ApiClientService } from '../../../../services/api-client.service';
import { ToastrService } from 'ngx-toastr';
import { FilePreviewModalComponent } from '../file-preview-modal/file-preview-modal.component';
import { ShareModalComponent } from '../share-modal/share-modal.component';
import { FileItem, Folder } from '../../../../models/file-item.model';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../../shared/dialogs/confirm-dialog/confirm-dialog.component';
import { InputDialogComponent, InputDialogData } from '../../../../shared/dialogs/input-dialog/input-dialog.component';
import { firstValueFrom } from 'rxjs';

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
    imports: [CommonModule, FilePreviewModalComponent, ShareModalComponent, MatDialogModule],
    templateUrl: './incoming-files.component.html',
    styleUrls: ['../../fileshare.component.css'],
})
export class IncomingFilesComponent implements OnInit {
    // Inputs
    user = input.required<User | null>();
    refreshTrigger = input<number>(0);
    forceResetCount = input<number>(0);
    scope = input<'mine' | 'shared' | 'sent'>('mine');

    // Outputs
    unreadCountChange = output<number>();
    openUpload = output<void>();

    // Mobile FAB state
    mobileFabOpen = signal(false);

    // Sort signals
    showSortMenu = signal(false);
    sortConfig = signal<SortConfig>({
        field: 'name',
        order: 'asc',
        foldersPosition: 'top'
    });

    // Data signals
    files = signal<FileItem[]>([]);
    folders = signal<Folder[]>([]);
    currentFolder = signal<Folder | null>(null);
    breadcrumbs = signal<Breadcrumb[]>([{ id: null, name: 'Mi unidad', folder: null }]);

    // UI state signals
    loading = signal(true);
    isNavigating = signal(false);
    isDragging = signal(false);
    uploading = signal(false);
    uploadProgress = signal(0);
    viewMode = signal<'grid' | 'list'>('grid');
    selectedFile = signal<FileItem | null>(null);
    contextMenu = signal<ContextMenu | null>(null);
    // Which options button is currently active (for mobile): { type, id }
    activeOptions = signal<{ type: 'file' | 'folder' | 'background'; id: number | null } | null>(null);
    moveDialogOpen = signal(false);
    moveDialogLoading = signal(false);
    moveDialogBusy = signal(false);
    moveOptions = signal<MoveOption[]>([]);
    moveTargetFile = signal<FileItem | Folder | null>(null);
    hoveredFolderId = signal<number | null>(null);
    hoveredBreadcrumbKey = signal<string | null>(null);
    animateList = signal(false);
    isSortMenuOpen = signal(false);

    // Share modal
    shareModalItem = signal<FileItem | Folder | null>(null);
    shareModalType = signal<'file' | 'folder'>('file');

    // Selection mode signals
    isSelectionMode = signal(false);
    bulkSelectionActive = signal(false);
    selectedFileIds = signal<Set<number>>(new Set());
    selectedFolderIds = signal<Set<number>>(new Set());

    // Touch handling
    private touchStartX = 0;
    private touchStartY = 0;
    private touchStartTime = 0;
    private readonly TOUCH_DELAY = 300;
    private touchTimer: any = null;
    private longPressActive = false;
    private dragPreviewElement: HTMLElement | null = null;
    // Helper to detect if the touch started on an options button
    private touchStartedOnOptions = false;
    // Touch-drag emulation state
    private touchDragActive = false;
    private touchDraggingItem: FileItem | Folder | null = null;
    private touchPreviewElement: HTMLElement | null = null;
    // id of folder currently being dragged (desktop or touch) — used to hide selection UI
    private currentDraggedFolderId: number | null = null;
    // navigation guard to prevent duplicate navigations
    private lastNavigationTarget: number | null = null;
    private lastNavigationTime: number = 0;

    // Computed sorted lists
    sortedFolders = computed(() => {
        const folders = this.folders();
        return [...folders].sort((a, b) => this.compareItems(a, b, 'folder'));
    });

    sortedFiles = computed(() => {
        const files = this.files();
        return [...files].sort((a, b) => this.compareItems(a, b, 'file'));
    });

    constructor(
        private apiClient: ApiClientService,
        private toastr: ToastrService,
        private dialog: MatDialog,
        private uploadService: UploadService
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

        // Scope effect
        effect(() => {
            const currentScope = this.scope();
            untracked(() => {
                this.clearSelection();
                this.currentFolder.set(null);
                this.resetBreadcrumbs();
                this.hoveredFolderId.set(null);
                this.hoveredBreadcrumbKey.set(null);
                void this.refreshContent();
            });
        });

        // Force reset effect
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

        // Unread count effect
        effect(() => {
            const unreadCount = this.files().filter((f) => !f.is_viewed).length;
            this.unreadCountChange.emit(unreadCount);
        });
    }

    ngOnInit(): void {
        // Initial load handled by effects
    }

    async refreshContent(): Promise<void> {
        const isInitialLoad = this.files().length === 0 && this.folders().length === 0;
        const isNavigation = this.isNavigating();

        if (isInitialLoad && !isNavigation) {
            this.loading.set(true);
        }

        try {
            await Promise.all([this.fetchFiles(), this.fetchFolders()]);
        } finally {
            this.loading.set(false);
            this.isNavigating.set(false);
        }
    }

    // ============== DEVELOPMENT LATENCY SIMULATION ==============
    // Set to true to simulate random network latency for testing the spinner
    // IMPORTANT: Set to false before deploying to production!
    private readonly SIMULATE_LATENCY = false;
    private readonly MIN_LATENCY_MS = 60;
    private readonly MAX_LATENCY_MS = 300;

    private async simulateLatency(): Promise<void> {
        if (!this.SIMULATE_LATENCY) return;
        const delay = Math.floor(Math.random() * (this.MAX_LATENCY_MS - this.MIN_LATENCY_MS + 1)) + this.MIN_LATENCY_MS;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    // ============================================================

    async fetchFiles(): Promise<void> {
        try {
            await this.simulateLatency(); // DEV: Remove or disable for production
            const folderId = this.currentFolder()?.id;
            console.debug('[incoming-files] fetchFiles parentId=', folderId);
            const data = await this.apiClient.listFiles(folderId, this.scope());

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
            await this.simulateLatency(); // DEV: Remove or disable for production
            const parentId = this.currentFolder()?.id;
            console.debug('[incoming-files] fetchFolders parentId=', parentId, 'scope=', this.scope());
            const data = await this.apiClient.listFolders(parentId, this.scope());
            this.folders.set(this.normalizeFolderResponse(data));
        } catch (error) {
            console.error('Error fetching folders', error);
            this.folders.set([]);
        }
    }

    async navigateToFolder(folder: Folder | null, options?: { path?: Breadcrumb[] }): Promise<void> {
        const now = Date.now();
        const targetId = folder?.id ?? null;
        if (this.lastNavigationTarget === targetId && (now - this.lastNavigationTime) < 700) {
            console.debug('[incoming-files] Ignoring duplicate navigation to', targetId);
            return;
        }
        this.lastNavigationTarget = targetId;
        this.lastNavigationTime = now;

        // Start navigation mode - clear data immediately to prevent "flash" of old content
        this.isNavigating.set(true);
        this.files.set([]);
        this.folders.set([]);

        if (options?.path) {
            this.breadcrumbs.set(options.path);
        } else if (!folder) {
            this.resetBreadcrumbs();
        } else {
            try {
                const fullPath = await this.buildBreadcrumbsForFolder(folder);
                console.debug('[incoming-files] built fullPath:', fullPath);
                this.breadcrumbs.set(fullPath);
            } catch (err) {
                const currentPath = this.breadcrumbs();
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
        this.animateList.set(true);
        setTimeout(() => this.animateList.set(false), 800);
        await this.refreshContent();
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
        this.activeOptions.set(null);
        // Cleanup any touch-drag state to avoid UI getting stuck
        this.removeTouchPreview();
        this.touchDragActive = false;
        this.touchDraggingItem = null;
        this.isDragging.set(false);
        this.hoveredFolderId.set(null);
        this.currentDraggedFolderId = null;
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        
        // Cerrar menú si se hace click fuera del componente o en áreas ng-star-inserted que no sean el menú
        const isInsideComponent = target.closest('.incomingFiles');
        const isContextMenu = target.closest('.context-menu');
        const isOptionsBtn = target.closest('.optionsBtn');
        
        // Si no está dentro del componente principal O está dentro pero no es el menú/botón
        if (!isInsideComponent || (!isContextMenu && !isOptionsBtn && isInsideComponent)) {
            this.closeContextMenu();
        }
    }

    handleContextMenu(event: MouseEvent, type: 'file' | 'folder' | 'background', item?: FileItem | Folder): void {
        event.preventDefault();
        event.stopPropagation();

        if (this.isSelectionMode()) {
            return;
        }

        // Obtener coordenadas del mouse
        let x = event.pageX || event.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft);
        let y = event.pageY || event.clientY + (document.documentElement.scrollTop || document.body.scrollTop);
        
        const menuWidth = 200;
        const menuHeight = 250;
        const margin = 10; // Margen desde los bordes

        if (typeof window !== 'undefined') {
            // Ajuste horizontal - similar al vertical
            const viewportX = x - window.scrollX;
            const distanceFromRight = window.innerWidth - viewportX;
            
            // Si está a menos de 100px del borde derecho, mover 50px a la izquierda
            if (distanceFromRight < 100) {
                x = x + 30;
            }
            
            // Ajuste extremo - si se sale completamente del viewport
            if (x + menuWidth > window.innerWidth + window.scrollX) {
                // Si se sale por la derecha, mostrar a la izquierda
                x = Math.max(window.scrollX + margin, x - menuWidth);
            } else if (x < window.scrollX + margin) {
                // Si está demasiado cerca del borde izquierdo
                x = window.scrollX + margin;
            }

            // Ajuste vertical sutil - solo si está muy cerca del borde inferior
            const viewportY = y - window.scrollY;
            const distanceFromBottom = window.innerHeight - viewportY;
            
            // Si está a menos de 100px del borde inferior, subir 50px
            // if (distanceFromBottom < 100 && distanceFromBottom > 50) {
            //     y = y - 50;
            // }

            if (distanceFromBottom < 100) {
                y = y - 100;
            }
        }

        // Cleanup any touch drag state before opening menu
        this.removeTouchPreview();
        this.touchDragActive = false;
        this.touchDraggingItem = null;
        this.isDragging.set(false);
        this.hoveredFolderId.set(null);
        this.currentDraggedFolderId = null;

        
        this.contextMenu.set({ x, y, type, item });
        // mark the clicked options button as active so mobile CSS can show the circle
        const id = item && (item as any).id ? Number((item as any).id) : null;
        this.activeOptions.set({ type, id });
    }

    async createFolder(): Promise<void> {
        const dialogData: InputDialogData = {
            title: 'Nueva carpeta',
            label: 'Nombre de la carpeta',
            placeholder: 'Ingrese el nombre de la carpeta',
            confirmLabel: 'Crear',
            cancelLabel: 'Cancelar'
        };

        const dialogRef = this.dialog.open(InputDialogComponent, {
            width: '350px',
            data: dialogData
        });

        try {
            const result = await firstValueFrom(dialogRef.afterClosed());

            if (result) {
                const creatingToast = this.toastr.info('Creando carpeta...', '', { disableTimeOut: true });

                try {
                    await this.apiClient.createFolder(result, this.currentFolder()?.id ?? undefined);
                    this.toastr.clear(creatingToast.toastId);
                    this.toastr.success('Carpeta creada correctamente');
                    await this.refreshContent();
                } catch (error) {
                    console.error('Error al crear carpeta', error);
                    this.toastr.clear(creatingToast.toastId);
                    this.toastr.error('Error al crear la carpeta');
                }
            }
        } catch (error) {
            console.error('Error en el diálogo de creación de carpeta', error);
        }
    }
    
    async renameItem(): Promise<void> {
        const menu = this.contextMenu();
        if (!menu || !menu.item || menu.type === 'background') {
            return;
        }

        const isFolder = menu.type === 'folder';
        const currentName = isFolder
            ? (menu.item as Folder).name
            : (menu.item as FileItem).filename;

        const dialogRef = this.dialog.open<InputDialogComponent, InputDialogData, string>(InputDialogComponent, {
            width: '400px',
            data: {
                title: `Renombrar ${isFolder ? 'carpeta' : 'archivo'}`,
                label: 'Nuevo nombre',
                initialValue: currentName,
                confirmLabel: 'Guardar',
                cancelLabel: 'Cancelar',
                placeholder: isFolder ? 'Mi carpeta' : 'archivo.ext',
                validator: (value) => (value.trim().length === 0 ? 'El nombre no puede estar vacío' : null),
            },
        });

        const result = await firstValueFrom(dialogRef.afterClosed());
        
        // AHORA sí cerramos el contexto después de que el diálogo se cerró
        this.closeContextMenu();
        
        const newName = result?.trim();
        if (!newName || newName === currentName) {
            return;
        }

        const renameToast = this.toastr.info(`Renombrando ${isFolder ? 'carpeta' : 'archivo'}...`, '', {
            disableTimeOut: true,
        });

        try {
            if (isFolder) {
                await this.apiClient.renameFolder((menu.item as Folder).id, newName);
                await this.fetchFolders();
            } else {
                await this.apiClient.renameFile((menu.item as FileItem).id, newName);
                await this.fetchFiles();
            }

            this.toastr.clear(renameToast.toastId);
            this.toastr.success(`${isFolder ? 'Carpeta' : 'Archivo'} renombrado`);
            await this.refreshContent();
        } catch (error) {
            console.error('Rename failed', error);
            this.toastr.clear(renameToast.toastId);
            this.toastr.error(`Error al renombrar ${isFolder ? 'la carpeta' : 'el archivo'}`);
        }
    }

    async deleteItem(): Promise<void> {
        // console.log(`[Fileshare] deleteItem called`);
        const menu = this.contextMenu();
        if (!menu || !menu.item) {
            // console.log(`[Fileshare] deleteItem - no menu or item, returning`);
            return;
        }

        const isFolder = menu.type === 'folder';
        const itemId = Number(menu.item.id);
        const itemName = isFolder ? (menu.item as Folder).name : (menu.item as FileItem).filename;
        
        // console.log(`[Fileshare] deleteItem - isFolder: ${isFolder}, itemId: ${itemId}, itemName: ${itemName}`);

        const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
            data: {
                title: `Eliminar ${isFolder ? 'carpeta' : 'archivo'}`,
                message: 'Esta acción no se puede deshacer.',
                detail: itemName,
                confirmLabel: 'Eliminar',
                cancelLabel: 'Cancelar',
                destructive: true,
            },
            width: '400px',
            disableClose: false,
            hasBackdrop: true,
        });

        const confirmed = (await firstValueFrom(dialogRef.afterClosed())) ?? false;
        
        // console.log(`[Fileshare] deleteItem - dialog confirmed: ${confirmed}`);
        
        // AHORA sí cerramos el contexto después de que el diálogo se cerró
        this.closeContextMenu();
        
        if (!confirmed) {
            // console.log(`[Fileshare] deleteItem - user cancelled, returning`);
            return;
        }

        // console.log(`[Fileshare] deleteItem - proceeding with deletion`);
        if (isFolder) {
            await this.performFolderDelete(itemId);
        } else {
            await this.performDelete(itemId);
        }
    }

    private async performFolderDelete(folderId: number): Promise<void> {
        const idToDelete = Number(folderId);
        const deleteToast = this.toastr.info('Eliminando carpeta...', '', { disableTimeOut: true });

        try {
            await this.apiClient.deleteFolder(idToDelete);
            
            // Solo eliminar de la UI después de éxito en el servidor
            this.folders.update(fs => fs.filter(f => Number(f.id) !== idToDelete));
            this.clearSelection();
            
            this.toastr.clear(deleteToast.toastId);
            this.toastr.success('Carpeta eliminada correctamente');
            setTimeout(() => this.refreshContent(), 500);
        } catch (error) {
            console.error('Error al eliminar carpeta', error);
            this.toastr.clear(deleteToast.toastId);
            this.toastr.error('Error al eliminar la carpeta');
            // Refrescar contenido para restaurar el estado correcto
            await this.refreshContent();
        }
    }

    async handleFolderDownload(folder: Folder): Promise<void> {
        try {
            const downloadToast = this.toastr.info('Descargando carpeta...', '', { disableTimeOut: true });

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
        this.closeContextMenu();
        
        // Verificar permisos ANTES de mostrar el modal
        void this.checkSharePermissions(item, type);
    }

    async checkSharePermissions(item: FileItem | Folder, type: 'file' | 'folder'): Promise<void> {
        try {
            // Verificar si tiene permisos para gestionar acceso
            if (type === 'file') {
                await this.apiClient.listFileAccess(item.id);
            } else {
                await this.apiClient.listFolderAccess(item.id);
            }
            
            // Si llegamos aquí, tiene permisos, mostrar el modal
            this.shareModalItem.set(item);
            this.shareModalType.set(type);
            
        } catch (error: any) {
            console.error('Error checking share permissions', error);
            
            // Si es un error 403 de permisos denegados
            if (error.status === 403) {
                this.toastr.error('No tienes permisos para gestionar el acceso a este archivo', '', {
                    timeOut: 5000,
                });
                return;
            }
            
            // Otros errores
            this.toastr.error('Error al verificar permisos');
        }
    }

    closeShareModal(): void {
        this.shareModalItem.set(null);
    }

    isMobile(): boolean {
        if (typeof window === 'undefined') return false;
        return window.innerWidth <= 768;
    }

    handleItemTouchStart(event: TouchEvent, type?: 'file' | 'folder', item?: any): void {
        // If type and item are not provided, we can't proceed with selection logic
        if (type === undefined || item === undefined) {
            return;
        }

        // Detect if the touch started on the options button; if so, don't trigger preview/select logic
        const targetEl = event.target as HTMLElement | null;
        this.touchStartedOnOptions = !!(targetEl && targetEl.closest && targetEl.closest('.optionsBtn'));
        if (this.touchStartedOnOptions) {
            // Let the native click on the options button run; don't start timers or selection.
            return;
        }

        this.touchStartX = event.touches[0].clientX;
        this.touchStartY = event.touches[0].clientY;
        this.touchStartTime = Date.now();
        this.longPressActive = false;

        this.touchTimer = setTimeout(() => {
            this.longPressActive = true;
            this.toggleItemSelection(type, item);
        }, this.TOUCH_DELAY);

        // mark a candidate for touch-drag emulation (files and folders)
        if ((type === 'file' || type === 'folder') && item) {
            this.touchDraggingItem = item as any;
            this.touchDragActive = false;
        }
    }

    async handleItemTouchEnd(event: TouchEvent, type: 'file' | 'folder', item: any): Promise<void> {
        if (this.touchTimer) {
            clearTimeout(this.touchTimer);
            this.touchTimer = null;
        }

        // If the touch started on an options button, don't trigger previews or navigation here.
        if (this.touchStartedOnOptions) {
            this.touchStartedOnOptions = false;
            return;
        }

        if (this.longPressActive) {
            this.longPressActive = false;
            // cleanup any touch-drag remnants
            this.removeTouchPreview();
            this.touchDragActive = false;
            this.touchDraggingItem = null;
            this.isDragging.set(false);
            this.hoveredFolderId.set(null);
            this.currentDraggedFolderId = null;
            return;
        }

        // If a touch-drag emulation was active, handle drop logic
        if (this.touchDragActive && this.touchDraggingItem) {
            // determine hovered folder id
            const targetFolderId = this.hoveredFolderId();
            const itemId = Number((this.touchDraggingItem as any).id);
            const isFile = !!(this.touchDraggingItem as any).filename;
            this.removeTouchPreview();
            this.touchDragActive = false;
            const dragged = this.touchDraggingItem;
            this.touchDraggingItem = null;
            this.isDragging.set(false);
            this.currentDraggedFolderId = null;
            if (targetFolderId != null) {
                if (isFile) {
                    void this.apiClient.moveFileToFolder(itemId, targetFolderId)
                        .then(() => {
                            this.toastr.success('Movido correctamente');
                            void this.refreshContent();
                        })
                        .catch(() => this.toastr.error('Error al mover archivo'));
                } else {
                    void this.apiClient.moveFolderToFolder(itemId, targetFolderId)
                        .then(() => {
                            this.toastr.success('Carpeta movida correctamente');
                            void this.refreshContent();
                        })
                        .catch(() => this.toastr.error('Error al mover carpeta'));
                }
                return;
            }
        }

        if (this.isSelectionMode()) {
            event.preventDefault();
            this.toggleItemSelection(type, item);
            // ensure no drag UI remains
            this.removeTouchPreview();
            this.touchDragActive = false;
            this.touchDraggingItem = null;
            this.isDragging.set(false);
            this.hoveredFolderId.set(null);
            return;
        }

        const touchEndTime = Date.now();
        const touchDuration = touchEndTime - this.touchStartTime;

        if (touchDuration < this.TOUCH_DELAY && !this.hasSignificantMovement(event)) {
            // Prevent subsequent click events and stop propagation immediately
            try { event.preventDefault(); } catch (e) { }
            try { event.stopPropagation(); } catch (e) { }

            if (type === 'folder') {
                await this.navigateToFolder(item as Folder);
            } else {
                this.openFilePreview(item as FileItem);
            }

            // cleanup drag state after navigation/preview
            this.removeTouchPreview();
            this.touchDragActive = false;
            this.touchDraggingItem = null;
            this.isDragging.set(false);
            this.hoveredFolderId.set(null);
            return;
        }

        // cleanup drag state in case no short-tap occurred
        event.preventDefault();
        this.removeTouchPreview();
        this.touchDragActive = false;
        this.touchDraggingItem = null;
        this.isDragging.set(false);
        this.hoveredFolderId.set(null);
    }

    private hasSignificantMovement(event: TouchEvent): boolean {
        if (!event.changedTouches || event.changedTouches.length === 0) return false;

        const touch = event.changedTouches[0];
        const deltaX = Math.abs(touch.clientX - this.touchStartX);
        const deltaY = Math.abs(touch.clientY - this.touchStartY);

        return deltaX > 15 || deltaY > 15;
    }

    openFilePreview(file: FileItem): void {
        if (!file.is_viewed) {
            void this.markAsViewed(file.id);
        }
        this.selectedFile.set(file);
    }

    handleItemClick(event: MouseEvent, type: 'file' | 'folder', item: FileItem | Folder): void {
        event.stopPropagation();

        if (this.isMobile()) return;

        const detail = (event as MouseEvent).detail || 1;
        if (detail === 2 && type === 'folder') {
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
        
        // Cerrar menú si se hace click fuera del componente o en áreas ng-star-inserted que no sean el menú
        const isInsideComponent = target.closest('.incomingFiles');
        const isContextMenu = target.closest('.context-menu');
        const isOptionsBtn = target.closest('.optionsBtn');
        
        // Si no está dentro del componente principal O está dentro pero no es el menú/botón
        if (!isInsideComponent || (!isContextMenu && !isOptionsBtn && isInsideComponent)) {
            this.closeContextMenu();
        }
    }

    private async buildBreadcrumbsForFolder(folder: Folder): Promise<Breadcrumb[]> {
        const crumbs: Breadcrumb[] = [{ id: null, name: this.getScopeRootLabel(), folder: null }];
        try {
            const stack: Folder[] = [];
            let current: Folder | null = folder;

            while (current) {
                stack.push(current);
                if (current.parent == null) break;

                try {
                    const parentData = await this.apiClient.getFolder(current.parent as number);
                    if (!parentData) break;
                    current = parentData as Folder;
                } catch (err) {
                    console.warn('[incoming-files] failed to fetch parent folder', current.parent, err);
                    break;
                }
            }

            stack.reverse();
            console.debug('[incoming-files] ancestor stack reversed:', stack);
            stack.forEach(f => crumbs.push({ id: f.id, name: f.name, folder: f }));
        } catch (error) {
            console.error('Error building breadcrumbs for folder', error);
            crumbs.push({ id: folder.id, name: folder.name, folder });
        }
        return crumbs;
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

    async downloadSelected(): Promise<void> {
        const selectedFileIds = this.selectedFileIds();
        const selectedFolderIds = this.selectedFolderIds();
        const totalSelected = selectedFileIds.size + selectedFolderIds.size;
        
        if (totalSelected === 0) {
            return;
        }

        try {
            // Si hay múltiples archivos o carpetas, crear un ZIP
            if (totalSelected > 1) {
                const downloadToast = this.toastr.info('Creando ZIP con archivos seleccionados...', '', {
                    disableTimeOut: true
                });

                try {
                    // Crear FormData con los IDs de archivos y carpetas
                    const formData = new FormData();
                    
                    // Añadir IDs de archivos como array
                    selectedFileIds.forEach(fileId => {
                        formData.append('file_ids[]', fileId.toString());
                    });
                    
                    // Añadir IDs de carpetas como array
                    selectedFolderIds.forEach(folderId => {
                        formData.append('folder_ids[]', folderId.toString());
                    });

                    // Llamar al endpoint de descarga múltiple
                    const zipBlob = await this.apiClient.downloadMultiple(formData);
                    
                    // Crear URL y descargar el ZIP
                    const url = window.URL.createObjectURL(zipBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `archivos_seleccionados_${new Date().getTime()}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    
                    this.toastr.clear(downloadToast.toastId);
                    this.toastr.success('ZIP descargado correctamente');
                    this.clearSelection();
                } catch (zipError) {
                    this.toastr.clear(downloadToast.toastId);
                    console.error('Error creating ZIP:', zipError);
                    this.toastr.error('Error al crear el ZIP con los archivos seleccionados');
                }
            } else {
                // Si es solo un archivo, descargarlo directamente
                if (selectedFileIds.size === 1) {
                    const fileId = Array.from(selectedFileIds)[0];
                    await this.apiClient.downloadFile(fileId);
                } else if (selectedFolderIds.size === 1) {
                    const folderId = Array.from(selectedFolderIds)[0];
                    await this.apiClient.downloadFolder(folderId);
                }
                
                this.toastr.success('Descarga completada');
                this.clearSelection();
            }
        } catch (error) {
            console.error('Error downloading selected items:', error);
            this.toastr.error('Error al descargar archivos seleccionados');
        }
    }

    async deleteSelected(): Promise<void> {
        const selectedFileIds = this.selectedFileIds();
        const selectedFolderIds = this.selectedFolderIds();
        const totalSelected = selectedFileIds.size + selectedFolderIds.size;
        
        if (totalSelected === 0) {
            return;
        }

        // Construir mensaje específico si hay carpetas
        let message = `Esta acción eliminará ${totalSelected} elemento(s) y no se puede deshacer.`;
        let detail = '';
        
        if (selectedFolderIds.size > 0) {
            message = `Esta acción eliminará ${totalSelected} elemento(s) incluyendo ${selectedFolderIds.size} carpeta(s) con todo su contenido.`;
            detail = '⚠️ Todas las carpetas seleccionadas serán eliminadas junto con todos sus archivos y subcarpetas.';
        }

        const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
            data: {
                title: 'Eliminar seleccionados',
                message: message,
                detail: detail,
                confirmLabel: 'Eliminar',
                cancelLabel: 'Cancelar',
                destructive: true,
            },
            width: '400px',
            disableClose: false,
            hasBackdrop: true,
        });

        const confirmed = (await firstValueFrom(dialogRef.afterClosed())) ?? false;
        
        if (!confirmed) {
            return;
        }

        try {
            // Eliminar archivos seleccionados
            for (const fileId of selectedFileIds) {
                await this.apiClient.deleteFile(fileId);
            }

            // Eliminar carpetas seleccionadas
            for (const folderId of selectedFolderIds) {
                await this.apiClient.deleteFolder(folderId);
            }

            this.toastr.success(`${totalSelected} elemento(s) eliminados`);
            await this.refreshContent();
            this.clearSelection();
        } catch (error) {
            console.error('Error deleting selected items:', error);
            this.toastr.error('Error al eliminar elementos seleccionados');
            await this.refreshContent();
            this.clearSelection();
        }
    }

    isFileSelected(id: number): boolean {
        return this.selectedFileIds().has(id);
    }

    isFolderSelected(id: number): boolean {
        // hide selection UI for the folder currently being dragged
        if (this.currentDraggedFolderId !== null && this.currentDraggedFolderId === id) return false;
        return this.selectedFolderIds().has(id);
    }

    async handleFileDrop(event: DragEvent, targetFolder: Folder): Promise<void> {
        event.preventDefault();
        event.stopPropagation();
        this.hoveredFolderId.set(null);
        // First check for folder drag
        const folderData = event.dataTransfer?.getData('application/x-folder');
        if (folderData) {
            const folderId = parseInt(folderData, 10);
            if (folderId === targetFolder.id) {
                this.toastr.info('No se puede mover una carpeta dentro de sí misma');
                return;
            }

            // try to find dragged folder locally to check same parent
            const draggedFolder = this.folders().find(f => Number(f.id) === folderId);
            if (draggedFolder && (draggedFolder.parent ?? null) === targetFolder.id) {
                this.toastr.info('La carpeta ya está en esa ubicación');
                return;
            }

            // Prevent moving folder into one of its own descendants
            try {
                const isDesc = await this.isDescendantFolder(targetFolder.id, folderId);
                if (isDesc) {
                    this.toastr.error('No se puede mover una carpeta dentro de una de sus subcarpetas');
                    return;
                }
            } catch (err) {
                // if check fails, continue but backend should validate as well
                console.warn('isDescendantFolder check failed', err);
            }

            try {
                await this.apiClient.moveFolderToFolder(folderId, targetFolder.id);
                this.toastr.success(`Carpeta movida a ${targetFolder.name}`);
                await this.refreshContent();
            } catch (error) {
                console.error('Error moving folder', error);
                this.toastr.error('Error al mover carpeta');
            }
            return;
        }

        const fileId = event.dataTransfer?.getData('application/json');
        if (fileId) {
            const id = parseInt(fileId, 10);
            // check if file already in target folder
            const f = this.files().find(x => Number(x.id) === id);
            const currentFolderId = f ? (f.folder ?? null) : null;
            if (currentFolderId === targetFolder.id) {
                this.toastr.info('El archivo ya está en esa carpeta');
                return;
            }

            try {
                await this.apiClient.moveFileToFolder(id, targetFolder.id);
                this.toastr.success(`Movido a ${targetFolder.name}`);
                await this.refreshContent();
            } catch (error) {
                this.toastr.error('Error al mover archivo');
            }
        }
    }

    handleFolderDragOver(event: DragEvent, folder: Folder): void {
        if (!this.isInternalFileDrag(event)) return;
        // If dragging a folder, don't mark the same folder as a drop target
        try {
            const folderDragData = event.dataTransfer?.getData('application/x-folder');
            if (folderDragData) {
                const draggedId = parseInt(folderDragData, 10);
                if (draggedId === folder.id) return;
            }
        } catch (e) {
            // ignore
        }

        if (this.currentDraggedFolderId !== null && this.currentDraggedFolderId === Number(folder.id)) return;

        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        if (this.hoveredFolderId() !== folder.id) {
            this.hoveredFolderId.set(folder.id);
        }
    }

    // Touch move - emulate drag on touch devices
    handleTouchMove(event: TouchEvent, type: 'file' | 'folder', item: any): void {
        if (!event.changedTouches || event.changedTouches.length === 0) return;
        const touch = event.changedTouches[0];

        const deltaX = Math.abs(touch.clientX - this.touchStartX);
        const deltaY = Math.abs(touch.clientY - this.touchStartY);

        // If touch started on options button, ignore
        if (this.touchStartedOnOptions) return;

        // If movement exceeds threshold, cancel any pending long-press selection
        const MOVEMENT_THRESHOLD = 15;
        const moved = deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD;
        if (moved && this.touchTimer) {
            clearTimeout(this.touchTimer);
            this.touchTimer = null;
        }

        // If primarily vertical movement, treat as scroll: do not start emulated drag or select
        if (moved && deltaY > deltaX) {
            // ensure we don't accidentally show hover state while scrolling
            this.hoveredFolderId.set(null);
            return;
        }

        // Start emulated drag if movement significant and mostly horizontal
        if (!this.touchDragActive && moved && this.touchDraggingItem) {
            this.touchDragActive = true;
            this.isDragging.set(true);
            this.createTouchPreview(touch.clientX, touch.clientY, this.touchDraggingItem);
            // if dragging a folder, track its id to hide selection UI
            if (this.touchDraggingItem && !('filename' in this.touchDraggingItem)) {
                this.currentDraggedFolderId = Number((this.touchDraggingItem as any).id);
            }
        }

        if (this.touchDragActive) {
            event.preventDefault();
            // move preview
            if (this.touchPreviewElement) {
                this.touchPreviewElement.style.left = `${touch.clientX + 8}px`;
                this.touchPreviewElement.style.top = `${touch.clientY + 8}px`;
            }

            // detect element under finger
            const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
            if (!el) {
                this.hoveredFolderId.set(null);
                return;
            }

            const folderEl = el.closest('.folderCard') as HTMLElement | null;
            if (folderEl) {
                const idAttr = folderEl.getAttribute('data-folder-id');
                const fid = idAttr ? Number(idAttr) : null;
                // If we're touch-dragging a folder, don't highlight the same folder
                if (this.touchDraggingItem && !(('filename') in this.touchDraggingItem)) {
                    const draggedId = Number((this.touchDraggingItem as any).id);
                    if (fid === draggedId) {
                        this.hoveredFolderId.set(null);
                    } else {
                        this.hoveredFolderId.set(fid);
                    }
                } else {
                    this.hoveredFolderId.set(fid);
                }
            } else {
                this.hoveredFolderId.set(null);
            }
        }
    }

    handleTouchCancel(event: TouchEvent): void {
        if (this.touchTimer) {
            clearTimeout(this.touchTimer);
            this.touchTimer = null;
        }
        if (this.touchDragActive) {
            this.removeTouchPreview();
            this.touchDragActive = false;
            this.touchDraggingItem = null;
            this.isDragging.set(false);
            this.hoveredFolderId.set(null);
            this.currentDraggedFolderId = null;
        }
        this.touchStartedOnOptions = false;
    }

    private createTouchPreview(x: number, y: number, item: FileItem | Folder): void {
        this.removeTouchPreview();
        const preview = document.createElement('div');
        preview.className = 'touch-drag-preview';
        preview.style.position = 'fixed';
        preview.style.left = `${x + 8}px`;
        preview.style.top = `${y + 8}px`;
        preview.style.zIndex = '9999';
        preview.style.pointerEvents = 'none';
        preview.style.padding = '6px';
        preview.style.borderRadius = '8px';
        preview.style.background = 'rgba(0,0,0,0.7)';
        preview.style.color = 'white';
        preview.style.fontSize = '12px';
        const label = 'filename' in item ? item.filename : item.name;
        preview.textContent = label || 'elemento';
        document.body.appendChild(preview);
        this.touchPreviewElement = preview;
    }


    private removeTouchPreview(): void {
        if (this.touchPreviewElement) {
            try { document.body.removeChild(this.touchPreviewElement); } catch (e) { }
            this.touchPreviewElement = null;
        }
    }

    handleDragStart(event: DragEvent, file: FileItem): void {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return;

        dataTransfer.setData('application/json', file.id.toString());
        dataTransfer.effectAllowed = 'move';

        // No limpiar el estado de selección durante el arrastre
        // La selección debe mantenerse visible durante todo el proceso
        
        this.createDragPreview(dataTransfer, file, event.target as HTMLElement);
    }

    handleDragEnd(): void {
        if (this.dragPreviewElement) {
            document.body.removeChild(this.dragPreviewElement);
            this.dragPreviewElement = null;
        }
        this.hoveredFolderId.set(null);
        this.hoveredBreadcrumbKey.set(null);
        this.currentDraggedFolderId = null;
    }

    async markAsViewed(fileId: number): Promise<void> {
        this.files.update((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, is_viewed: true } : f))
        );

        try {
            await this.apiClient.markFileViewed(fileId);
        } catch (error) {
            console.error('Failed to mark as viewed', error);
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

    openPreview(item: FileItem | Folder): void {
        if (!('filename' in item)) {
            console.warn('openPreview called with non-file item', item);
            return;
        }

        const file = item as FileItem;

        if (!file.is_viewed) {
            void this.markAsViewed(file.id);
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
        if (this.isExternalDrag(event)) {
            this.isDragging.set(true);
        }
    }

    handleDragLeave(event: DragEvent): void {
        event.preventDefault();
        
        // Solo limpiar si realmente estamos saliendo del contenedor principal
        const currentTarget = event.currentTarget as HTMLElement;
        const relatedTarget = event.relatedTarget as Node;
        
        // Verificar si relatedTarget es null o está fuera del currentTarget
        if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
            this.isDragging.set(false);
            this.hoveredFolderId.set(null);
            this.hoveredBreadcrumbKey.set(null);
        }
    }

    async handleDrop(event: DragEvent): Promise<void> {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(false);
        this.hoveredFolderId.set(null);
        this.hoveredBreadcrumbKey.set(null);
        // support folder drags
        const folderData = event.dataTransfer?.getData('application/x-folder');
        if (folderData) {
            const folderId = parseInt(folderData, 10);
            const targetParent = this.currentFolder()?.id ?? null;
            if (folderId === targetParent) {
                this.toastr.info('No se puede mover una carpeta dentro de sí misma');
                return;
            }

            const draggedFolder = this.folders().find(f => Number(f.id) === folderId);
            if (draggedFolder && (draggedFolder.parent ?? null) === targetParent) {
                this.toastr.info('La carpeta ya está en esa ubicación');
                return;
            }

            try {
                const isDesc = await this.isDescendantFolder(targetParent, folderId);
                if (isDesc) {
                    this.toastr.error('No se puede mover una carpeta dentro de una de sus subcarpetas');
                    return;
                }
            } catch (err) {
                console.warn('isDescendantFolder check failed', err);
            }

            try {
                await this.apiClient.moveFolderToFolder(folderId, targetParent);
                this.toastr.success('Carpeta movida correctamente');
                await this.refreshContent();
            } catch (error) {
                this.toastr.error('Error al mover carpeta');
            }
            return;
        }

        const fileId = event.dataTransfer?.getData('application/json');
        if (fileId) {
            return;
        }

        const droppedFiles = event.dataTransfer?.files;
        if (droppedFiles && droppedFiles.length > 0 && this.user()) {
            const files = Array.from(droppedFiles);
            
            // Validar archivos antes de subir
            const validationResult = this.validateFiles(files);
            if (!validationResult.valid) {
                this.toastr.error(validationResult.error);
                return;
            }
            
            await this.uploadFiles(files);
        }
    }

    async handleUpload(file: File): Promise<void> {
        // Este método ya no se usa, redirigir al uploadFiles para usar el widget
        await this.uploadFiles([file]);
    }

    validateFiles(files: File[]): { valid: boolean; error?: string } {
        // Validar que el usuario esté autenticado
        if (!this.user()) {
            return { valid: false, error: 'Debes estar autenticado para subir archivos' };
        }

        // Validar que el usuario sea staff
        if (!this.user()!.is_staff) {
            return { valid: false, error: 'Solo usuarios staff pueden subir archivos' };
        }

        // Validar número de archivos
        if (files.length === 0) {
            return { valid: false, error: 'No se seleccionaron archivos' };
        }

        if (files.length > 10) {
            return { valid: false, error: 'No puedes subir más de 10 archivos a la vez' };
        }

        // Validar cada archivo
        for (const file of files) {
            // Validar tamaño (máximo 100MB por archivo)
            const maxSize = 100 * 1024 * 1024; // 100MB
            if (file.size > maxSize) {
                return { valid: false, error: `El archivo ${file.name} excede el tamaño máximo de 100MB` };
            }

            // Validar tipo de archivo
            const allowedTypes = [
                'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
                'application/pdf', 'text/plain', 'text/csv',
                'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
                'video/mp4', 'video/avi', 'video/mov', 'video/wmv',
                'audio/mp3', 'audio/wav', 'audio/ogg'
            ];

            if (!allowedTypes.includes(file.type) && file.type !== '') {
                return { valid: false, error: `Tipo de archivo no permitido: ${file.name} (${file.type})` };
            }

            // Validar nombre de archivo
            if (file.name.length > 255) {
                return { valid: false, error: `El nombre del archivo ${file.name} es demasiado largo` };
            }
        }

        return { valid: true };
    }

    async uploadFiles(files: File[]): Promise<void> {
        // Validar archivos antes de subir (doble seguridad)
        const validationResult = this.validateFiles(files);
        if (!validationResult.valid) {
            this.toastr.error(validationResult.error);
            return;
        }

        // Siempre usar el UploadService con widget (incluso para un solo archivo)
        // Establecer contexto de subida
        this.uploadService.setUploadContext(
            this.user()!.username,
            this.currentFolder()?.id,
            this.currentFolder()?.owner
        );
        
        this.uploadService.uploadFiles(files);
        
        // Refrescar el contenido después de un tiempo para mostrar los archivos subidos
        setTimeout(() => {
            void this.refreshContent();
        }, 1000);
    }

    async handleSingleUpload(file: File): Promise<void> {
        this.uploading.set(true);
        this.uploadProgress.set(0);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('recipient_username', this.user()!.username);

            if (this.currentFolder()) {
                formData.append('folder', this.currentFolder()!.id.toString());
                // Enviar el owner de la carpeta para herencia de propiedad
                if (this.currentFolder()!.owner) {
                    formData.append('owner', this.currentFolder()!.owner.toString());
                }
            }

            await this.apiClient.uploadFile(formData, (progressEvent: any) => {
                const percentCompleted = Math.round(
                    (progressEvent.loaded * 100) / progressEvent.total
                );
                this.uploadProgress.set(percentCompleted);
            });

            this.uploadProgress.set(0);
        } catch (error: any) {
            console.error('Upload failed', error);
            let errorMessage = 'Error al subir el archivo';
            if (error.payload && error.payload.file) {
                errorMessage = error.payload.file;
            } else if (error.message) {
                errorMessage = error.message;
            }
            throw new Error(errorMessage);
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

    private showMalwareWarning(executableList: string, moreCount: string): Promise<boolean> {
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
                { disableTimeOut: true, closeButton: false, enableHtml: true }
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

    async handleDelete(fileId: number): Promise<void> {
        const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
            data: {
                title: 'Eliminar archivo',
                message: 'Esta acción no se puede deshacer.',
                confirmLabel: 'Eliminar',
                cancelLabel: 'Cancelar',
                destructive: true,
            },
        });

        const confirmed = await firstValueFrom(dialogRef.afterClosed());
        if (!confirmed) {
            return;
        }

        await this.performDelete(fileId);
    }

    async performDelete(fileId: number): Promise<void> {
        const idToDelete = Number(fileId);
        const deleteToast = this.toastr.info('Eliminando archivo...', '', { disableTimeOut: true });

        // console.log(`[Fileshare] ===== START DELETE PROCESS =====`);
        // console.log(`[Fileshare] performDelete for ID ${idToDelete}`);
        // console.log(`[Fileshare] File to delete:`, this.files().find(f => Number(f.id) === idToDelete));

        try {
            // console.log(`[Fileshare] Calling apiClient.deleteFile(${fileId})`);
            await this.apiClient.deleteFile(fileId);
            // console.log(`[Fileshare] apiClient.deleteFile SUCCESS for ID ${idToDelete}`);
            
            // Solo eliminar de la UI después de éxito en el servidor
            this.files.update(fs => fs.filter(f => Number(f.id) !== idToDelete));
            this.selectedFile.set(null);
            this.clearSelection();
            
            this.toastr.clear(deleteToast.toastId);
            this.toastr.success('Archivo eliminado correctamente');
            setTimeout(() => this.refreshContent(), 500);
        } catch (error) {
            console.error(`[Fileshare] performDelete ERROR for ID ${idToDelete}:`, error);
            // console.log(`[Fileshare] ===== END DELETE PROCESS (ERROR) =====`);
            this.toastr.error('Error al eliminar el archivo');
            this.toastr.clear(deleteToast.toastId);
            // Refrescar contenido para restaurar el estado correcto
            await this.refreshContent();
        }
    }

    isImage(filename: string): boolean {
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
    }

    getFileUrl(fileId: number): string {
        // Use a relative URL so the browser resolves host/origin correctly.
        return `/api/transfers/${fileId}/download/`;
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
        // internal drags may be files or folders
        return types.includes('application/json') || types.includes('application/x-folder');
    }

    handleFolderDragStart(event: DragEvent, folder: Folder): void {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return;

        dataTransfer.setData('application/x-folder', folder.id.toString());
        dataTransfer.effectAllowed = 'move';

        // create a simple drag image for folder
        this.createFolderDragPreview(dataTransfer, folder, event.target as HTMLElement);
        this.currentDraggedFolderId = Number(folder.id);
    }

    private createFolderDragPreview(dataTransfer: DataTransfer, folder: Folder, target: HTMLElement): void {
        if (this.dragPreviewElement) {
            try { document.body.removeChild(this.dragPreviewElement); } catch (e) { }
            this.dragPreviewElement = null;
        }

        const preview = document.createElement('div');
        preview.className = 'dragPreview folderPreview';
        // Use inline-flex + constrained max-width to avoid full-width previews
        preview.style.display = 'inline-flex';
        preview.style.alignItems = 'center';
        preview.style.gap = '0.75rem';
        preview.style.padding = '0.55rem 0.85rem';
        preview.style.background = 'rgba(0, 0, 0, 0.6)';
        preview.style.borderRadius = '9px';
        preview.style.color = '#fff';
        preview.style.boxSizing = 'border-box';
        preview.style.maxWidth = '380px';
        preview.style.width = 'auto';
        preview.style.overflow = 'hidden';
        preview.style.whiteSpace = 'nowrap';
        preview.style.textOverflow = 'ellipsis';

        const icon = document.createElement('div');
        icon.textContent = '📁';
        icon.style.fontSize = '1.6rem';
        preview.appendChild(icon);

        const label = document.createElement('span');
        label.textContent = folder.name;
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.maxWidth = '260px';
        preview.appendChild(label);

        document.body.appendChild(preview);

        const rect = preview.getBoundingClientRect();
        const offsetX = rect.width / 2;
        const offsetY = rect.height / 2;
        try {
            dataTransfer.setDragImage(preview, offsetX, offsetY);
        } catch (e) {
            // ignore if not supported
        }

        this.dragPreviewElement = preview;
    }

    handleFolderDragEnter(event: DragEvent, folder: Folder): void {
        if (!this.isInternalFileDrag(event)) return;
        // avoid marking the folder being dragged as a drop target
        try {
            const folderDragData = event.dataTransfer?.getData('application/x-folder');
            if (folderDragData) {
                const draggedId = parseInt(folderDragData, 10);
                if (draggedId === folder.id) return;
            }
        } catch (e) { }

        if (this.currentDraggedFolderId !== null && this.currentDraggedFolderId === Number(folder.id)) return;

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

        // support folder drags as well
        const folderData = event.dataTransfer?.getData('application/x-folder');
        this.hoveredBreadcrumbKey.set(null);
        const targetFolderId = crumb.id ?? null;

        if (folderData) {
            const folderId = parseInt(folderData, 10);
            if (folderId === targetFolderId) {
                this.toastr.info('No se puede mover una carpeta dentro de sí misma');
                return;
            }

            const draggedFolder = this.folders().find(f => Number(f.id) === folderId);
            if (draggedFolder && (draggedFolder.parent ?? null) === targetFolderId) {
                this.toastr.info('La carpeta ya está en esa ubicación');
                return;
            }

            try {
                const isDesc = await this.isDescendantFolder(targetFolderId, folderId);
                if (isDesc) {
                    this.toastr.error('No se puede mover una carpeta dentro de una de sus subcarpetas');
                    return;
                }
            } catch (err) {
                console.warn('isDescendantFolder check failed', err);
            }

            try {
                await this.apiClient.moveFolderToFolder(folderId, targetFolderId);
                this.toastr.success(`Carpeta movida a ${crumb.name}`);
                await this.refreshContent();
            } catch (error) {
                console.error('Error moving folder', error);
                this.toastr.error('Error al mover carpeta');
            }
            return;
        }

        const fileId = event.dataTransfer?.getData('application/json');
        if (!fileId) {
            return;
        }

        const id = parseInt(fileId, 10);
        const fileObj = this.files().find(x => Number(x.id) === id);
        const currentFolderId = fileObj ? (fileObj.folder ?? null) : null;
        if (currentFolderId === targetFolderId) {
            this.toastr.info('El archivo ya está en esa carpeta');
            return;
        }

        try {
            await this.apiClient.moveFileToFolder(id, targetFolderId);
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

    isOptionsActive(type: 'file' | 'folder' | 'background', item?: FileItem | Folder): boolean {
        const active = this.activeOptions();
        if (!active) return false;
        const id = item && (item as any).id ? Number((item as any).id) : null;
        return active.type === type && active.id === id;
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

        if ('filename' in item) {
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
            this.moveDialogBusy.set(true);

            try {
                throw new Error('Mover carpetas no está implementado aún');
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

        const isOwner = item.owner_username ? item.owner_username === currentUser.username : false;
        const isUploader = item.uploader_username ? item.uploader_username === currentUser.username : false;
        const hasExplicitAccess = !!item.has_access && !isOwner;

        if (this.scope() === 'mine') {
            return isOwner;
        }

        if (this.scope() === 'sent') {
            return isUploader && !isOwner;
        }

        if (this.scope() === 'shared') {
            return hasExplicitAccess;
        }

        return false;
    }

    isSentScope(): boolean {
        return this.scope() === 'sent';
    }

    isShared(item: FileItem | Folder): boolean {
        const currentUser = this.user();
        if (!currentUser) return false;

        // Para archivos (FileItem)
        if ('filename' in item) {
            // Un archivo está compartido si tiene access_list con otros usuarios
            // (independientemente de si el usuario actual es el owner)
            const hasAccessList = item.access_list && item.access_list.length > 0;
            return !!hasAccessList;
        }
        
        // Para carpetas (Folder)
        if ('name' in item) {
            // Una carpeta está compartida si tiene access_list con otros usuarios
            // (independientemente de si el usuario actual es el owner)
            const hasAccessList = item.access_list && item.access_list.length > 0;
            return !!hasAccessList;
        }
        
        return false;
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
                const response = await this.apiClient.listFolders(parentId ?? undefined, this.scope());
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

    private async isDescendantFolder(targetFolderId: number | null, ancestorFolderId: number): Promise<boolean> {
        if (targetFolderId == null) return false;
        try {
            let currentId: number | null = targetFolderId;
            while (currentId != null) {
                if (currentId === ancestorFolderId) return true;
                const folder = await this.apiClient.getFolder(currentId);
                if (!folder) break;
                // folder.parent may be null or a number
                const parent = (folder as any).parent ?? null;
                if (parent == null) break;
                currentId = parent as number;
            }
        } catch (err) {
            console.warn('isDescendantFolder error', err);
            return false;
        }
        return false;
    }

    closeSortMenu(): void {
        this.isSortMenuOpen.set(false);
    }

    toggleSortMenu(): void {
        this.isSortMenuOpen.update(v => !v);
    }

    setSortConfig(config: Partial<SortConfig>): void {
        this.sortConfig.update(current => ({ ...current, ...config }));
        this.showSortMenu.set(false);
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
                    result = 0;
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

    closeContextMenuWithDelay(): void {
        setTimeout(() => this.closeContextMenu(), 100);
    }

    closeContextMenuAfterShare(): void {
        this.closeContextMenuWithDelay();
    }

    closeContextMenuAfterDownload(): void {
        this.closeContextMenuWithDelay();
    }

    closeContextMenuAfterPreview(): void {
        this.closeContextMenuWithDelay();
    }

    closeContextMenuAfterMove(): void {
        this.closeContextMenuWithDelay();
    }

    closeContextMenuAfterRename(): void {
        this.closeContextMenuWithDelay();
    }

    closeContextMenuAfterDelete(): void {
        this.closeContextMenuWithDelay();
    }

    closeContextMenuAfterUpload(): void {
        this.closeContextMenuWithDelay();
    }

    closeContextMenuAfterCreateFolder(): void {
        this.closeContextMenuWithDelay();
    }

    triggerFileUpload(): void {
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) {
            fileInput.click();
        }
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const files = Array.from(input.files);
            const uploadPromises = files.map(file => this.handleUpload(file));

            Promise.all(uploadPromises).then(() => {
                if (input) {
                    input.value = '';
                }
            }).catch((error) => {
                console.error('Error en carga por lotes:', error);
            });
        }
    }
}
