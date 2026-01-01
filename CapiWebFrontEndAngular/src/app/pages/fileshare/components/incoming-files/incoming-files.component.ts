import { Component, signal, computed, effect, inject, ChangeDetectorRef, HostListener, OnInit, input, output, untracked, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { UploadService } from '../../../../shared/services/upload.service';
import { DownloadService } from '../../../../shared/services/download.service';
import { CommonModule } from '@angular/common';
import { ApiClientService } from '../../../../services/api-client.service';
import { ToastrService } from 'ngx-toastr';
import { FilePreviewModalComponent } from '../file-preview-modal/file-preview-modal.component';
import { ShareModalComponent } from '../share-modal/share-modal.component';
import { FileItem, Folder } from '../../../../models/file-item.model';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../../shared/dialogs/confirm-dialog/confirm-dialog.component';
import { InputDialogComponent, InputDialogData } from '../../../../shared/dialogs/input-dialog/input-dialog.component';
import { firstValueFrom, Subscription } from 'rxjs';

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

import { trigger, transition, style, animate, query, stagger } from '@angular/animations';

@Component({
    selector: 'app-incoming-files',
    imports: [CommonModule, FilePreviewModalComponent, ShareModalComponent, MatDialogModule],
    templateUrl: './incoming-files.component.html',
    styleUrls: ['../../fileshare.component.css'],
    animations: [
        trigger('itemAnimation', [
            transition(':enter', [
                style({ opacity: 0, transform: 'translateY(15px)' }),
                animate('300ms {{delay}}ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
            ])
        ]),
        trigger('menuAnimation', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('150ms ease-out', style({ opacity: 1 }))
            ]),
            transition(':leave', [
                animate('100ms ease-in', style({ opacity: 0 }))
            ])
        ])
    ]
})
export class IncomingFilesComponent implements OnInit, OnDestroy {
    // Inputs
    user = input.required<User | null>();
    refreshTrigger = input<number>(0);
    forceResetCount = input<number>(0);
    scope = input<'mine' | 'shared' | 'sent'>('mine');

    // Shared link inputs for anonymous access
    sharedLinkToken = input<string | null>(null);
    sharedLinkData = input<any>(null);

    // Initial state for share link redirects
    initialFolderId = input<number | null>(null);
    initialPreviewFileId = input<number | null>(null);

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

    // Computed signal combining folders and files for easier searching/iteration
    items = computed(() => [...this.folders(), ...this.files()]);
    breadcrumbs = signal<Breadcrumb[]>([{ id: null, name: 'Mi unidad', folder: null }]);

    // UI state signals
    loading = signal(true);
    isNavigating = signal(false);
    animationTrigger = signal(0);
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
    // Image loading state
    loadingImages = signal<Set<number>>(new Set());
    // Upload completion subscription
    private uploadCompletedSubscription: Subscription | null = null;
    private partialUploadSubscription: Subscription | null = null;
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
    private readonly TOUCH_DELAY = 1000;
    private readonly PRE_SELECTION_DELAY = 500;
    private touchTimer: any = null;
    private preSelectionTimer: any = null;
    private longPressActive = false;
    private dragPreviewElement: HTMLElement | null = null;
    pressingItemId = signal<number | null>(null);
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

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

    // Computed sorted lists
    sortedFolders = computed(() => {
        const folders = this.folders();
        return [...folders].sort((a, b) => this.compareItems(a, b, 'folder'));
    });

    sortedFiles = computed(() => {
        const files = this.files();
        return [...files].sort((a, b) => this.compareItems(a, b, 'file'));
    });

    /**
     * Crea una instancia de IncomingFilesComponent.
     * Configura efectos reactivos para disparadores de refresco, cambios de scope y conteo de no leídos.
     * 
     * @description Inicializa el componente con el cliente API, notificaciones toast, servicio de diálogos
     * y servicio de subida. Configura varios efectos Angular para reaccionar a cambios de inputs y
     * eventos de suscripción del servicio de subida.
     * 
     * @llamadoPor Inyección de dependencias de Angular
     * @cuando Se instancia el componente
     */
    constructor(
        private apiClient: ApiClientService,
        private toastr: ToastrService,
        private dialog: MatDialog,
        private uploadService: UploadService,
        private downloadService: DownloadService
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

        // Suscribirse al evento de completado de subidas
        this.uploadCompletedSubscription = this.uploadService.allUploadsCompleted$.subscribe(() => {
            // Mostrar spinner y recargar contenido después de que todas las subidas terminen
            void this.refreshContentWithSpinner();
        });

        // Suscribirse al evento de subidas parciales (con errores pero al menos una exitosa)
        this.partialUploadSubscription = this.uploadService.partialUploadCompleted$.subscribe(() => {
            // Recargar contenido para mostrar los archivos que sí se subieron
            void this.refreshContent();
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

        // Shared link data effect - for anonymous access
        effect(() => {
            const data = this.sharedLinkData();
            if (data) {
                untracked(() => {
                    this.loading.set(false);

                    if (data.type === 'folder' && data.folder) {
                        // Set up folder view with breadcrumbs
                        const folder: Folder = {
                            id: data.folder.id,
                            name: data.folder.name,
                            owner: 0, // Unknown for shared links
                            parent: null,
                            owner_username: data.folder.owner_username,
                            created_at: data.folder.created_at
                        };
                        this.currentFolder.set(folder);
                        this.breadcrumbs.set([
                            { id: null, name: 'Mi unidad', folder: null },
                            { id: folder.id, name: folder.name, folder: folder }
                        ]);

                        // Set files from shared data
                        if (data.files) {
                            const files: FileItem[] = data.files.map((f: any) => ({
                                id: f.id,
                                filename: f.filename,
                                size: f.size,
                                created_at: f.created_at,
                                is_image: f.is_image || false,
                                is_viewed: true
                            }));
                            this.setFilesWithLoadingState(files);
                        }

                        // Set subfolders
                        if (data.subfolders) {
                            const subfolders: Folder[] = data.subfolders.map((f: any) => ({
                                id: f.id,
                                name: f.name,
                                owner: 0,
                                parent: folder.id,
                                created_at: f.created_at
                            }));
                            this.folders.set(subfolders);
                        }

                        this.animationTrigger.update(v => v + 1);
                    } else if (data.type === 'file' && data.file) {
                        // Open file preview directly
                        const file: FileItem = {
                            id: data.file.id,
                            filename: data.file.filename,
                            size: data.file.size,
                            created_at: data.file.created_at,
                            is_viewed: true
                        };
                        this.selectedFile.set(file);
                    }
                });
            }
        });

        // Effect for initial folder navigation from share link redirects
        effect(() => {
            const folderId = this.initialFolderId();
            if (folderId) {
                untracked(() => {
                    this.apiClient.getFolder(folderId)
                        .then(folder => {
                            this.navigateToFolder(folder);
                        })
                        .catch(err => console.error('Failed to load initial folder', err));
                });
            }
        });

        // Effect for initial file preview from share link redirects
        effect(() => {
            const fileId = this.initialPreviewFileId();
            const files = this.files();

            if (fileId && files.length > 0) {
                untracked(() => {
                    // Check if file is already open to avoid loops
                    if (this.selectedFile()?.id === fileId) return;

                    const file = files.find(f => f.id === fileId);
                    if (file) {
                        this.openFilePreview(file);
                    }
                });
            }
        });
    }

    /**
     * Hook del ciclo de vida de Angular llamado después del primer ciclo de detección de cambios.
     * La carga inicial de datos se maneja mediante efectos en el constructor.
     * 
     * @llamadoPor Angular
     * @cuando Después de que los inputs del componente se enlazan por primera vez
     */
    ngOnInit(): void {
        // Initial load handled by effects
    }

    /**
     * Refresca archivos y carpetas desde la API para la carpeta actual.
     * Muestra spinner de carga en la carga inicial, garantiza mínimo 500ms de tiempo de carga para UX.
     * 
     * @description Obtiene archivos y carpetas en paralelo. Gestiona el estado de carga
     * y dispara animación después de cargar el contenido.
     * 
     * @llamadoPor Efectos del constructor (refreshTrigger, scope, forceReset), navigateToFolder, eventos uploadService
     * @cuando El usuario navega, suben archivos, cambia el scope, o se dispara refresco manual
     * @returns Promise que se resuelve cuando el contenido está cargado
     */
    async refreshContent(): Promise<void> {
        const isInitialLoad = this.files().length === 0 && this.folders().length === 0;
        const isNavigation = this.isNavigating();

        if (isInitialLoad && !isNavigation) {
            this.loading.set(true);
        }

        const startTime = Date.now();

        try {
            await Promise.all([this.fetchFiles(), this.fetchFolders()]);

            // Enforce minimum 500ms loading time
            const elapsed = Date.now() - startTime;
            if (elapsed < 500) {
                await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
            }
        } finally {
            this.loading.set(false);
            this.isNavigating.set(false);
            this.animationTrigger.update(v => v + 1);
        }
    }

    /**
     * Refresca contenido con spinner de carga visible por al menos 500ms.
     * Se usa después de que terminen las subidas por lotes para dar feedback visual.
     * 
     * @llamadoPor Suscripción uploadService.allUploadsCompleted$
     * @cuando Todas las subidas de archivos en un lote completan exitosamente
     * @returns Promise que se resuelve cuando el contenido está cargado y el spinner se oculta
     */
    async refreshContentWithSpinner(): Promise<void> {
        // Mostrar spinner por al menos 500ms
        this.loading.set(true);

        const startTime = Date.now();

        try {
            await Promise.all([this.fetchFiles(), this.fetchFolders()]);

            // Enforce minimum 500ms loading time
            const elapsed = Date.now() - startTime;
            if (elapsed < 500) {
                await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
            }
        } finally {
            this.loading.set(false);
            this.animationTrigger.update(v => v + 1);
        }
    }


    // ============== SIMULACIÓN DE LATENCIA PARA DESARROLLO ==============
    // Poner en true para simular latencia de red aleatoria para probar el spinner
    // IMPORTANTE: ¡Poner en false antes de desplegar a producción!
    private readonly SIMULATE_LATENCY = false;
    private readonly MIN_LATENCY_MS = 60;
    private readonly MAX_LATENCY_MS = 300;

    /**
     * Método solo para desarrollo que simula latencia de red.
     * Añade retraso aleatorio entre MIN_LATENCY_MS y MAX_LATENCY_MS.
     * 
     * @llamadoPor fetchFiles, fetchFolders
     * @cuando SIMULATE_LATENCY es true (solo desarrollo)
     * @returns Promise que se resuelve después de retraso aleatorio (o inmediatamente si está deshabilitado)
     */
    private async simulateLatency(): Promise<void> {
        if (!this.SIMULATE_LATENCY) return;
        const delay = Math.floor(Math.random() * (this.MAX_LATENCY_MS - this.MIN_LATENCY_MS + 1)) + this.MIN_LATENCY_MS;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    // ============================================================

    /**
     * Obtiene archivos desde la API para la carpeta actual y scope.
     * Maneja respuestas de API tanto paginadas como no paginadas.
     * 
     * @llamadoPor refreshContent, refreshContentWithSpinner
     * @cuando Se necesita refrescar el contenido
     * @returns Promise que se resuelve cuando los archivos están obtenidos y establecidos
     */
    async fetchFiles(): Promise<void> {
        try {
            await this.simulateLatency(); // DEV: Remove or disable for production
            const folderId = this.currentFolder()?.id;
            console.debug('[incoming-files] fetchFiles parentId=', folderId);
            const data = await this.apiClient.listFiles(folderId, this.scope());

            if (data && data.results && Array.isArray(data.results)) {
                this.setFilesWithLoadingState(data.results);
            } else if (Array.isArray(data)) {
                this.setFilesWithLoadingState(data);
            } else {
                this.files.set([]);
            }
        } catch (error) {
            console.error('Error fetching files', error);
            this.files.set([]);
        }
    }

    /**
     * Establece archivos e inicializa estado de carga para archivos de imagen.
     * Rastrea qué imágenes están cargando para mostrar spinners.
     * 
     * @llamadoPor fetchFiles
     * @cuando Se reciben archivos de la API
     * @param files - Array de items de archivo a establecer
     */
    private setFilesWithLoadingState(files: FileItem[]): void {
        const imageIds = files
            .filter(f => this.isImage(f.filename))
            .map(f => f.id);

        this.loadingImages.set(new Set(imageIds));
        this.files.set(files);
    }

    /**
     * Obtiene carpetas desde la API para la carpeta padre actual y scope.
     * Normaliza la respuesta para manejar diferentes formatos de API.
     * 
     * @llamadoPor refreshContent, refreshContentWithSpinner
     * @cuando Se necesita refrescar el contenido
     * @returns Promise que se resuelve cuando las carpetas están obtenidas y establecidas
     */
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

    /**
     * Marca todos los archivos en la carpeta actual como vistos en el servidor.
     * Se llama antes de navegar fuera de una carpeta.
     * 
     * @llamadoPor navigateToFolder
     * @cuando El usuario navega fuera de una carpeta con archivos no vistos
     * @returns Promise que se resuelve cuando la llamada API completa
     */
    private async markCurrentFolderViewed(): Promise<void> {
        const currentFolderId = this.currentFolder()?.id;
        if (currentFolderId) {
            try {
                await this.apiClient.markFolderContentsViewed(currentFolderId);
            } catch (error) {
                console.error('Failed to mark folder contents as viewed:', error);
            }
        }
    }


    /**
     * Navega a una carpeta, actualizando breadcrumbs y cargando contenido.
     * Marca la carpeta actual como vista antes de salir.
     * 
     * @description Maneja la navegación de carpetas con debouncing para prevenir llamadas duplicadas.
     * Actualiza breadcrumbs desde la ruta proporcionada o construyéndolos desde la jerarquía de carpetas.
     * Limpia el contenido actual inmediatamente para UX suave durante la carga.
     * 
     * @llamadoPor Template (doble-click en carpeta), handleItemTouchEnd, handleBreadcrumbClick
     * @cuando El usuario hace doble-click en carpeta, long-press en móvil, o click en breadcrumb
     * @param folder - Carpeta destino a navegar, o null para ir a raíz
     * @param options - Ruta opcional para establecer breadcrumbs sin fetch
     * @returns Promise que se resuelve cuando la navegación y carga de contenido completan
     */
    async navigateToFolder(folder: Folder | null, options?: { path?: Breadcrumb[] }): Promise<void> {
        // Mark current folder contents as viewed before leaving
        await this.markCurrentFolderViewed();


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

        await this.refreshContent();
    }

    /**
     * Maneja click en un breadcrumb, navegando a ese nivel de carpeta.
     * Trunca la ruta de breadcrumbs a la posición clickeada.
     * 
     * @llamadoPor Template (evento click en breadcrumb)
     * @cuando El usuario hace click en un item de breadcrumb
     * @param index - Índice del breadcrumb clickeado en el array de breadcrumbs
     * @returns Promise que se resuelve cuando la navegación completa
     */
    async handleBreadcrumbClick(index: number): Promise<void> {
        const path = this.breadcrumbs().slice(0, index + 1);
        const target = path[path.length - 1];
        const folder = target?.folder ?? null;
        await this.navigateToFolder(folder, { path });
    }

    /**
     * Cierra el menú contextual y resetea todo el estado UI relacionado.
     * También limpia cualquier estado de touch-drag para prevenir que la UI se quede bloqueada.
     * 
     * @llamadoPor onDocumentClick, onDocumentTouchStart, varios handlers del menú contextual
     * @cuando El usuario hace click fuera del menú contextual o completa una acción
     */
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

    /**
     * Maneja eventos de click a nivel de documento para cerrar menús al hacer click fuera.
     * Maneja cierre de menú FAB y menú contextual con propagación de eventos adecuada.
     * 
     * @llamadoPor Angular HostListener en 'document:click'
     * @cuando Ocurre cualquier click en cualquier parte del documento
     * @param event - El evento de click del mouse
     */
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;

        // Si hay un menú FAB móvil abierto, manejar su cierre
        if (this.mobileFabOpen()) {
            const isFabButton = target.closest('.mobile-fab');
            const isFabMenu = target.closest('.mobile-fab-menu');

            // Si el clic NO es en el botón FAB ni en el menú, cerrar el menú FAB y prevenir otras acciones
            if (!isFabButton && !isFabMenu) {
                this.mobileFabOpen.set(false);
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            // Si el clic es en el botón FAB o menú, no hacer nada para permitir que el evento llegue al botón
            return;
        }

        // Si hay un menú contextual abierto, manejar su cierre
        if (this.contextMenu()) {
            const isContextMenu = target.closest('.context-menu');
            const isOptionsBtn = target.closest('.optionsBtn');

            // Si el clic NO es en el menú ni en un botón de opciones, cerrar el menú y prevenir otras acciones
            if (!isContextMenu && !isOptionsBtn) {
                this.closeContextMenu();
                event.stopPropagation();
                event.preventDefault();
                return;
            }
        }

        // Lógica original para otros casos (cuando no hay menú abierto)
        const isInsideComponent = target.closest('.incomingFiles');

        // Si no está dentro del componente principal, cerrar menú
        if (!isInsideComponent) {
            this.closeContextMenu();
        }
    }

    /**
     * Maneja eventos de touch a nivel de documento para cerrar menús al tocar fuera.
     * Similar a onDocumentClick pero para dispositivos táctiles.
     * 
     * @llamadoPor Angular HostListener en 'document:touchstart'
     * @cuando Cualquier touch comienza en cualquier parte del documento
     * @param event - El evento de touch
     */
    @HostListener('document:touchstart', ['$event'])
    onDocumentTouchStart(event: TouchEvent): void {
        const target = event.target as HTMLElement;

        // Si hay un menú FAB móvil abierto, manejar su cierre
        if (this.mobileFabOpen()) {
            const isFabButton = target.closest('.mobile-fab');
            const isFabMenu = target.closest('.mobile-fab-menu');

            // Si el toque NO es en el botón FAB ni en el menú, cerrar el menú FAB y prevenir otras acciones
            if (!isFabButton && !isFabMenu) {
                this.mobileFabOpen.set(false);
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            // Si el toque es en el botón FAB o menú, no hacer nada para permitir el evento click y scroll
            return;
        }

        if (this.contextMenu()) {
            const touchedElement = event.target as HTMLElement;
            const isContextMenu = touchedElement.closest('.context-menu');
            const isOptionsBtn = touchedElement.closest('.optionsBtn');

            if (!isContextMenu && !isOptionsBtn) {
                this.closeContextMenu();
                event.stopPropagation();
                event.preventDefault();
                return;
            }
        }
    }

    /**
     * Abre un diálogo para crear una nueva carpeta en el directorio actual.
     * Muestra notificaciones toast para el progreso y resultado de la creación.
     * 
     * @llamadoPor Template (opción "Nueva carpeta" del menú contextual), menú FAB móvil
     * @cuando El usuario selecciona "Nueva carpeta" desde el menú contextual o FAB
     * @returns Promise que se resuelve cuando la creación de carpeta completa o el diálogo se cancela
     */
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

    /**
     * Abre el menú contextual en la posición especificada para un archivo, carpeta o fondo.
     * Calcula la posición óptima del menú para mantenerse dentro de los límites del viewport.
     * 
     * @description Maneja click derecho (escritorio) para mostrar opciones contextuales.
     * En móvil, esto se ignora a favor del long-press para selección.
     * Limpia cualquier estado de touch-drag antes de abrir el menú.
     * 
     * @llamadoPor Template (click derecho en archivo/carpeta/fondo), click en botón de opciones
     * @cuando El usuario hace click derecho en un item o hace click en el botón de tres puntos
     * @param event - El evento de mouse que dispara el menú contextual
     * @param type - Tipo de item: 'file', 'folder', o 'background'
     * @param item - El item de archivo o carpeta (undefined para background)
     */
    handleContextMenu(event: MouseEvent, type: 'file' | 'folder' | 'background', item?: FileItem | Folder): void {
        event.preventDefault();
        event.stopPropagation();

        // On mobile, native contextmenu event usually comes from long-press.
        // We want to use long-press for selection, so ignore this event.
        // The options menu should only be opened via the 3-dots button (which triggers click).
        if (this.isMobile() && event.type === 'contextmenu') {
            return;
        }

        if (this.isSelectionMode()) {
            return;
        }

        // Obtener coordenadas del click/touch
        let x = event.pageX || event.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft);
        let y = event.pageY || event.clientY + (document.documentElement.scrollTop || document.body.scrollTop);

        // Si es un click en botón de opciones, usar la posición del botón
        if (type !== 'background' && item && event.target) {
            const targetElement = event.target as HTMLElement;
            const optionsBtn = targetElement.closest('.optionsBtn');
            if (optionsBtn) {
                const rect = optionsBtn.getBoundingClientRect();
                // Coordenadas absolutas consistentes para position: fixed
                x = rect.left;
                y = rect.bottom;
            }
        }

        const menuWidth = 220;
        const menuHeight = 300;
        const margin = 10;

        if (typeof window !== 'undefined') {
            // Para position: fixed, usamos coordenadas del viewport directamente
            const maxX = window.innerWidth - menuWidth - margin;
            const maxY = window.innerHeight - menuHeight - margin;
            const minX = margin;
            const minY = margin;

            // Ajustar horizontalmente
            x = Math.max(minX, Math.min(x, maxX));

            // Ajustar verticalmente
            y = Math.max(minY, Math.min(y, maxY));
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

    /**
     * Abre un diálogo para renombrar un archivo o carpeta desde el menú contextual.
     * Valida el nuevo nombre y llama a la API para realizar el renombrado.
     * 
     * @llamadoPor Template (opción "Renombrar" del menú contextual)
     * @cuando El usuario selecciona "Renombrar" desde el menú contextual
     * @returns Promise que se resuelve cuando el renombrado completa o el diálogo se cancela
     */
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

    /**
     * Abre un diálogo de confirmación y elimina un archivo o carpeta.
     * Muestra notificaciones toast apropiadas durante el proceso de eliminación.
     * 
     * @llamadoPor Template (opción "Eliminar" del menú contextual)
     * @cuando El usuario selecciona "Eliminar" desde el menú contextual
     * @returns Promise que se resuelve cuando la eliminación completa o se cancela
     */
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

    /**
     * Realiza la eliminación real de la carpeta vía API.
     * Muestra notificaciones toast para progreso y resultado.
     * 
     * @llamadoPor deleteItem, handleBreadcrumbDrop (para limpieza)
     * @cuando El usuario confirma eliminación de carpeta
     * @param folderId - ID de la carpeta a eliminar
     * @returns Promise que se resuelve cuando la eliminación completa
     */
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

    /**
     * Descarga una carpeta como archivo ZIP.
     * Muestra notificaciones toast para progreso y resultado.
     * 
     * @llamadoPor Template (opción "Descargar" del menú contextual para carpetas)
     * @cuando El usuario selecciona "Descargar" en una carpeta desde el menú contextual
     * @param folder - La carpeta a descargar
     * @returns Promise que se resuelve cuando la descarga completa
     */
    async handleFolderDownload(folder: Folder): Promise<void> {
        try {
            const url = `/api/folders/${folder.id}/download/`;
            this.downloadService.downloadFolder(url, `${folder.name}.zip`);
            this.toastr.success('Descarga iniciada');
        } catch (error) {
            console.error('Error initiating folder download:', error);
            this.toastr.error('Error al iniciar la descarga');
        }
    }


    /**
     * Abre el modal de compartir para un archivo o carpeta.
     * Verifica permisos antes de mostrar el modal.
     * 
     * @llamadoPor Template (opción "Compartir" del menú contextual)
     * @cuando El usuario selecciona "Compartir" desde el menú contextual
     * @param item - El archivo o carpeta a compartir
     * @param type - Tipo de item: 'file' o 'folder'
     */
    openShareModal(item: FileItem | Folder, type: 'file' | 'folder'): void {
        this.closeContextMenu();

        // Verificar permisos ANTES de mostrar el modal
        void this.checkSharePermissions(item, type);
    }

    /**
     * Verifica si el usuario tiene permisos para gestionar acceso al item.
     * Muestra el modal de compartir si tiene permisos, o un error si no.
     * 
     * @llamadoPor openShareModal
     * @cuando Se abre el modal de compartir
     * @param item - El archivo o carpeta a verificar
     * @param type - Tipo de item: 'file' o 'folder'
     * @returns Promise que se resuelve tras verificar permisos
     */
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

    /**
     * Cierra el modal de compartir.
     * 
     * @llamadoPor ShareModalComponent (evento cerrar)
     * @cuando El usuario cierra el modal de compartir
     */
    closeShareModal(): void {
        this.shareModalItem.set(null);
    }

    /**
     * Detecta si el dispositivo es móvil basándose en el ancho de ventana.
     * 
     * @llamadoPor Template, handleContextMenu, varios métodos de touch
     * @cuando Se necesita comportamiento diferenciado móvil/escritorio
     * @returns true si el ancho de ventana es <= 768px
     */
    isMobile(): boolean {
        if (typeof window === 'undefined') return false;
        return window.innerWidth <= 768;
    }

    /**
     * Verifica si hay algún menú contextual o FAB abierto.
     * 
     * @llamadoPor Template
     * @cuando Se necesita verificar si hay menús abiertos
     * @returns true si hay menú contextual o FAB móvil abierto
     */
    isContextMenuOpen(): boolean {
        return !!this.contextMenu() || this.mobileFabOpen();
    }

    /**
     * Maneja el inicio de un touch en un archivo o carpeta.
     * Inicia temporizadores para long-press (selección) y emulación de drag.
     * 
     * @description Detecta si el touch comenzó en el botón de opciones e ignora en ese caso.
     * En modo selección, permite toggle rápido. Usa un delay de pre-selección para evitar
     * conflictos con el scroll.
     * 
     * @llamadoPor Template (evento touchstart en items)
     * @cuando El usuario toca un archivo o carpeta en móvil
     * @param event - El evento de touch
     * @param type - Tipo de item: 'file' o 'folder'
     * @param item - El item tocado
     */
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

        // If in selection mode, toggle immediately (quick select)
        if (this.isSelectionMode()) {
            // We still track touch start to distinguish from scroll, but no long press needed for subsequent items
            // Actually, the click handler usually handles this, but touchstart + click can be tricky.
            // We'll let the click handler or short-tap logic handle the toggle to avoid double-toggling.
            // Just record start time/pos for movement detection.
            this.touchStartX = event.touches[0].clientX;
            this.touchStartY = event.touches[0].clientY;
            this.touchStartTime = Date.now();
            return;
        }

        this.touchStartX = event.touches[0].clientX;
        this.touchStartY = event.touches[0].clientY;
        this.touchStartTime = Date.now();
        this.longPressActive = false;

        // Clear any previous timers
        if (this.preSelectionTimer) clearTimeout(this.preSelectionTimer);
        if (this.touchTimer) clearTimeout(this.touchTimer);

        // Start pre-selection timer (500ms dead zone)
        this.preSelectionTimer = setTimeout(() => {
            // Once pre-delay is over, show visual feedback and start the actual selection timer
            if (item && item.id) {
                this.pressingItemId.set(Number(item.id));
            }

            this.touchTimer = setTimeout(() => {
                this.longPressActive = true;
                this.pressingItemId.set(null); // Animation done
                this.toggleItemSelection(type, item);
                // Optional: Vibrate if supported
                if (navigator && navigator.vibrate) navigator.vibrate(50);
            }, this.TOUCH_DELAY);
        }, this.PRE_SELECTION_DELAY);

        // mark a candidate for touch-drag emulation (files and folders)
        if ((type === 'file' || type === 'folder') && item) {
            this.touchDraggingItem = item as any;
            this.touchDragActive = false;
        }
    }

    /**
     * Maneja el fin de un touch en un archivo o carpeta.
     * Detecta tap corto para vista previa/navegación, o completa una operación drag/drop.
     * 
     * @description Limpia timers de long-press, maneja navegación de carpetas con tap corto,
     * abre vista previa de archivos, y procesa drops de touch-drag emulado.
     * 
     * @llamadoPor Template (evento touchend en items)
     * @cuando El usuario levanta el dedo de un archivo o carpeta en móvil
     * @param event - El evento de touch
     * @param type - Tipo de item: 'file' o 'folder'
     * @param item - El item donde terminó el touch
     * @returns Promise que se resuelve tras completar la acción
     */
    async handleItemTouchEnd(event: TouchEvent, type: 'file' | 'folder', item: any): Promise<void> {
        if (this.preSelectionTimer) {
            clearTimeout(this.preSelectionTimer);
            this.preSelectionTimer = null;
        }
        if (this.touchTimer) {
            clearTimeout(this.touchTimer);
            this.touchTimer = null;
        }
        this.pressingItemId.set(null);

        // Si hay un menú contextual abierto, no hacer nada
        if (this.contextMenu()) {
            this.touchStartedOnOptions = false;
            return;
        }

        // If the touch started on an options button, don't trigger previews or navigation here.
        if (this.touchStartedOnOptions) {
            this.touchStartedOnOptions = false;
            return;
        }

        // Check if touch target is the selection checkbox
        const targetEl = event.target as HTMLElement;
        if (targetEl && targetEl.closest && targetEl.closest('.selectionCheckbox')) {
            this.toggleItemSelection(type, item);
            event.preventDefault();
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

    /**
     * Verifica si hubo movimiento significativo durante un touch.
     * Se usa para distinguir taps de scrolls o drags.
     * 
     * @llamadoPor handleItemTouchEnd
     * @cuando Se necesita determinar si un touch fue un tap limpio
     * @param event - El evento de touch
     * @returns true si el movimiento excede 15px en cualquier dirección
     */
    private hasSignificantMovement(event: TouchEvent): boolean {
        if (!event.changedTouches || event.changedTouches.length === 0) return false;

        const touch = event.changedTouches[0];
        const deltaX = Math.abs(touch.clientX - this.touchStartX);
        const deltaY = Math.abs(touch.clientY - this.touchStartY);

        return deltaX > 15 || deltaY > 15;
    }

    /**
     * Abre la vista previa de un archivo.
     * Marca el archivo como visto si aún no lo está.
     * 
     * @llamadoPor handleItemTouchEnd (tap corto en archivo), handleItemClick
     * @cuando El usuario hace tap/click en un archivo para verlo
     * @param file - El archivo a previsualizar
     */
    openFilePreview(file: FileItem): void {
        if (!file.is_viewed) {
            void this.markAsViewed(file.id);
        }
        this.selectedFile.set(file);
    }

    /**
     * Maneja clicks en archivos o carpetas (escritorio).
     * Distingue entre simple click (selección) y doble click (navegación).
     * 
     * @llamadoPor Template (evento click en items, solo escritorio)
     * @cuando El usuario hace click en un archivo o carpeta en escritorio
     * @param event - El evento de click
     * @param type - Tipo de item: 'file' o 'folder'
     * @param item - El item clickeado
     */
    handleItemClick(event: MouseEvent, type: 'file' | 'folder', item: FileItem | Folder): void {
        event.stopPropagation();

        // Si hay un menú contextual abierto, no hacer nada
        if (this.contextMenu()) {
            return;
        }

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

    /**
     * Maneja mousedown a nivel de documento para cerrar menús.
     * 
     * @llamadoPor Angular HostListener en 'document:mousedown'
     * @cuando Ocurre cualquier mousedown en el documento
     * @param event - El evento de mousedown
     */
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

    /**
     * Construye la ruta de breadcrumbs desde la raíz hasta la carpeta dada.
     * Recorre la jerarquía de padres hacia arriba y luego invierte.
     * 
     * @llamadoPor navigateToFolder
     * @cuando Se necesita reconstruir los breadcrumbs para una carpeta
     * @param folder - La carpeta destino
     * @returns Promise con array de Breadcrumbs desde raíz hasta la carpeta
     */
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

    /**
     * Alterna la selección de un archivo o carpeta.
     * Actualiza el modo de selección y el estado de selección masiva.
     * 
     * @llamadoPor handleItemClick, handleItemTouchEnd, Template (checkbox)
     * @cuando El usuario selecciona/deselecciona un item
     * @param type - Tipo de item: 'file' o 'folder'
     * @param item - El item a seleccionar/deseleccionar
     * @param isBulk - Si es parte de una operación de selección masiva
     */
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

        if (selectedCount > 0) {
            this.bulkSelectionActive.set(true);
        } else {
            this.bulkSelectionActive.set(false);
        }
    }

    /**
     * Limpia toda la selección de archivos y carpetas.
     * Desactiva el modo de selección.
     * 
     * @llamadoPor handleItemClick, navigateToFolder, scope/forceReset effects
     * @cuando Se necesita limpiar la selección actual
     */
    clearSelection(): void {
        this.selectedFileIds.set(new Set());
        this.selectedFolderIds.set(new Set());
        this.isSelectionMode.set(false);
        this.bulkSelectionActive.set(false);
    }

    /**
     * Descarga todos los items seleccionados como ZIP.
     * Muestra progreso y resultado con notificaciones toast.
     * 
     * @llamadoPor Template (botón "Descargar" en barra de acciones de selección)
     * @cuando El usuario tiene items seleccionados y hace click en descargar
     * @returns Promise que se resuelve cuando la descarga completa
     */
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
                    const file = this.items().find(i => 'id' in i && i.id === fileId) as FileItem;
                    if (file) {
                        const url = `/api/transfers/${fileId}/download/`;
                        this.downloadService.downloadFile(url, file.filename);
                    }
                } else if (selectedFolderIds.size === 1) {
                    const folderId = Array.from(selectedFolderIds)[0];
                    const folder = this.items().find(i => 'id' in i && i.id === folderId) as Folder;
                    if (folder) {
                        const url = `/api/folders/${folderId}/download/`;
                        this.downloadService.downloadFolder(url, `${folder.name}.zip`);
                    }
                }

                this.toastr.success('Descarga completada');
                this.clearSelection();
            }
        } catch (error) {
            console.error('Error downloading selected items:', error);
            this.toastr.error('Error al descargar archivos seleccionados');
        }
    }

    /**
     * Elimina todos los items seleccionados (archivos y carpetas).
     * Muestra diálogo de confirmación y notificaciones de progreso.
     * 
     * @llamadoPor Template (botón "Eliminar" en barra de acciones de selección)
     * @cuando El usuario tiene items seleccionados y hace click en eliminar
     * @returns Promise que se resuelve cuando la eliminación completa
     */
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

    /**
     * Verifica si un archivo está seleccionado.
     * 
     * @llamadoPor Template (para mostrar checkbox marcado)
     * @cuando Se renderiza un archivo en la lista
     * @param id - ID del archivo
     * @returns true si el archivo está seleccionado
     */
    isFileSelected(id: number): boolean {
        return this.selectedFileIds().has(id);
    }

    /**
     * Verifica si una carpeta está seleccionada.
     * Oculta la selección para la carpeta que se está arrastrando.
     * 
     * @llamadoPor Template (para mostrar checkbox marcado)
     * @cuando Se renderiza una carpeta en la lista
     * @param id - ID de la carpeta
     * @returns true si la carpeta está seleccionada y no se está arrastrando
     */
    isFolderSelected(id: number): boolean {
        // hide selection UI for the folder currently being dragged
        if (this.currentDraggedFolderId !== null && this.currentDraggedFolderId === id) return false;
        return this.selectedFolderIds().has(id);
    }

    /**
     * Maneja el drop de un archivo o carpeta sobre una carpeta destino.
     * Valida que no se mueva una carpeta dentro de sí misma o sus descendientes.
     * 
     * @llamadoPor Template (evento drop en carpetas)
     * @cuando El usuario suelta un archivo/carpeta arrastrado sobre otra carpeta
     * @param event - El evento de drag/drop
     * @param targetFolder - La carpeta destino del drop
     * @returns Promise que se resuelve cuando la operación completa
     */
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
        if (moved) {
            if (this.preSelectionTimer) {
                clearTimeout(this.preSelectionTimer);
                this.preSelectionTimer = null;
            }
            if (this.touchTimer) {
                clearTimeout(this.touchTimer);
                this.touchTimer = null;
                this.pressingItemId.set(null);
            }
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

        // NOTA: La validación de permisos se maneja en el backend (staff, superuser o grupo fileshare)
        // Eliminamos la validación del lado del cliente para permitir que el backend decida
        // if (!this.user()!.is_staff) {
        //    return { valid: false, error: 'Solo usuarios staff pueden subir archivos' };
        // }

        // Validar número de archivos
        if (files.length === 0) {
            return { valid: false, error: 'No se seleccionaron archivos' };
        }

        // Validar cada archivo
        for (const file of files) {
            // Validar tamaño (máximo 100MB por archivo)
            const maxSize = 100 * 1024 * 1024; // 100MB
            if (file.size > maxSize) {
                return { valid: false, error: `El archivo ${file.name} excede el tamaño máximo de 100MB` };
            }

            // Validar tipo de archivo - Lista extendida de tipos MIME permitidos
            const allowedTypes = [
                // Imágenes
                'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
                'image/bmp', 'image/ico', 'image/x-icon', 'image/vnd.microsoft.icon',
                // Documentos
                'application/pdf', 'text/plain', 'text/csv',
                'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                // Archivos comprimidos
                'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
                'application/gzip', 'application/x-tar', 'application/x-bzip2',
                // Video - TODOS los formatos comunes
                'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/x-msvideo',
                'video/quicktime', 'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska',
                'video/3gpp', 'video/3gpp2', 'video/mpeg', 'video/mp2t',
                // Audio - TODOS los formatos comunes (MP3 = audio/mpeg)
                'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
                'audio/aac', 'audio/flac', 'audio/x-m4a', 'audio/mp4',
                'audio/x-ms-wma', 'audio/vnd.wave', 'audio/wave'
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

        // El refresco ahora se maneja automáticamente cuando todas las subidas se completan
        // a través de la suscripción a allUploadsCompleted$
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

            const url = `/api/transfers/${id}/download/`;
            this.downloadService.downloadFile(url, filename);
            this.toastr.success('Descarga iniciada');
        } catch (error) {
            console.error('Download failed', error);
            this.toastr.error('Error al iniciar la descarga');
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
        return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(filename);
    }

    isVideo(filename: string): boolean {
        return /\.(mp4|webm|ogg|avi|mov|wmv|flv|mkv|3gp|m4v|mpg|mpeg)$/i.test(filename);
    }

    hasThumbnail(filename: string): boolean {
        // Imágenes y videos tienen miniatura
        return this.isImage(filename) || this.isVideo(filename);
    }

    getFileUrl(fileId: number): string {
        // Use a relative URL so the browser resolves host/origin correctly.
        return `/api/transfers/${fileId}/download/`;
    }

    getThumbnailUrl(fileId: number, filename?: string): string {
        // Para SVGs, usamos el propio archivo como miniatura ya que los navegadores lo renderizan bien
        if (filename && filename.toLowerCase().endsWith('.svg')) {
            return this.getFileUrl(fileId);
        }
        // Returns the thumbnail endpoint for optimized gallery preview
        return `/api/transfers/${fileId}/thumbnail/`;
    }


    onImageLoad(fileId: number): void {
        const currentLoading = new Set(this.loadingImages());
        currentLoading.delete(fileId);
        this.loadingImages.set(currentLoading);
    }

    onImageError(fileId: number): void {
        const currentLoading = new Set(this.loadingImages());
        currentLoading.delete(fileId);
        this.loadingImages.set(currentLoading);
    }

    isImageLoading(fileId: number): boolean {
        return this.loadingImages().has(fileId);
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

    /**
     * Dispara programáticamente el input de archivo oculto para abrir el selector de archivos.
     * 
     * @llamadoPor handleMobileUpload, Template (opción "Subir archivo" del menú contextual)
     * @cuando El usuario quiere subir archivos
     */
    triggerFileUpload(): void {
        if (this.fileInput && this.fileInput.nativeElement) {
            this.fileInput.nativeElement.click();
        }
    }

    /**
     * Maneja el disparo de subida de archivos desde el menú FAB móvil.
     * Retrasa el cierre del menú para prevenir que el navegador cancele el selector de archivos.
     * 
     * @llamadoPor Template (botón "Subir" del FAB móvil)
     * @cuando El usuario toca subir en el menú FAB móvil
     */
    handleMobileUpload(): void {
        // Trigger the click immediately
        this.triggerFileUpload();

        // Delay closing the menu to prevent the browser from cancelling the file picker
        // caused by DOM changes/loss of focus immediately after the click
        setTimeout(() => {
            this.mobileFabOpen.set(false);
        }, 300);
    }

    /**
     * Maneja la selección de archivos desde el input de archivo oculto.
     * Inicia la subida para todos los archivos seleccionados en paralelo.
     * 
     * @llamadoPor Template (evento change del input de archivo oculto)
     * @cuando El usuario selecciona archivos en el diálogo del selector de archivos
     * @param event - El evento change del input de archivo
     */
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

    /**
     * Hook del ciclo de vida de Angular llamado cuando el componente se destruye.
     * Marca la carpeta actual como vista y limpia las suscripciones para prevenir memory leaks.
     * 
     * @llamadoPor Angular
     * @cuando El componente está siendo destruido (usuario navega fuera, cambio de tab, etc.)
     */
    ngOnDestroy(): void {
        // Mark current folder contents as viewed before leaving
        void this.markCurrentFolderViewed();

        // Limpiar las suscripciones para evitar memory leaks
        if (this.uploadCompletedSubscription) {
            this.uploadCompletedSubscription.unsubscribe();
        }
        if (this.partialUploadSubscription) {
            this.partialUploadSubscription.unsubscribe();
        }
    }
}
