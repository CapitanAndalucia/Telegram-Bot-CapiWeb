import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { ToastrService } from 'ngx-toastr';
import { DownloadService } from '../../../../shared/services/download.service';
import { FilePreviewModalComponent } from '../file-preview-modal/file-preview-modal.component';
import { DownloadsMenuComponent } from '../../../../shared/components/downloads-menu/downloads-menu.component';
import { LazyLoadImageDirective } from '../../../../shared/directives/lazy-load-image.directive';

@Component({
    selector: 'app-shared-viewer',
    standalone: true,
    imports: [CommonModule, FilePreviewModalComponent, DownloadsMenuComponent, LazyLoadImageDirective],
    templateUrl: './shared-viewer.component.html',
    styleUrls: ['./shared-viewer.component.css']
})
export class SharedViewerComponent implements OnInit {
    loading = signal(true);
    error = signal<string | null>(null);
    sharedData = signal<any>(null);
    isAuthenticated = signal(false);
    folderContents = signal<any[]>([]);
    loadingContents = signal(false);
    shareToken = signal<string>('');
    selectedFile = signal<any>(null);

    // Track which images are still loading
    loadingImages = signal<Set<number>>(new Set());

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private api: ApiClientService,
        private toast: ToastrService,
        private downloadService: DownloadService
    ) { }

    ngOnInit(): void {
        const token = this.route.snapshot.paramMap.get('token');
        if (token) {
            this.loadSharedContent(token);
        } else {
            this.error.set('Token no proporcionado');
            this.loading.set(false);
        }
    }

    async loadSharedContent(token: string): Promise<void> {
        this.shareToken.set(token);
        this.loading.set(true);
        this.error.set(null);
        let isRedirecting = false;

        try {
            // Check if user is authenticated
            let isUserAuthenticated = false;
            try {
                await this.api.checkAuth();
                isUserAuthenticated = true;
                this.isAuthenticated.set(true);
            } catch {
                this.isAuthenticated.set(false);
            }

            // Access the shared link
            const data = await this.api.accessShareLink(token);
            this.sharedData.set(data);

            // If user is authenticated, redirect to main Fileshare
            if (isUserAuthenticated) {
                isRedirecting = true;
                if (data.type === 'folder' && data.folder) {
                    // Redirect to Fileshare, Compartidos tab, inside the folder
                    this.router.navigate(['/fileshare'], {
                        queryParams: {
                            scope: 'shared',
                            folderId: data.folder.id
                        }
                    });
                } else if (data.type === 'file' && data.file) {
                    // Redirect to Fileshare, Compartidos tab, with file preview open
                    this.router.navigate(['/fileshare'], {
                        queryParams: {
                            scope: 'shared',
                            previewFileId: data.file.id
                        }
                    });
                }
                return; // Exit early, redirect will handle the rest
            }

        } catch (err: any) {
            console.error('Error accessing shared link:', err);
            const message = err?.error?.error || 'Enlace no válido o expirado';
            this.error.set(message);
        } finally {
            if (!isRedirecting) {
                this.loading.set(false);
            }
        }
    }

    downloadFile(): void {
        const data = this.sharedData();
        if (data?.file) {
            // Use public download endpoint with share token
            const downloadUrl = `/api/share-links/${this.shareToken()}/download/${data.file.id}/`;
            this.downloadService.downloadFile(downloadUrl, data.file.filename);
            this.toast.success('Descargando archivo...');
        }
    }

    downloadFileById(fileId: number, filename: string): void {
        // Use public download endpoint with share token
        const downloadUrl = `/api/share-links/${this.shareToken()}/download/${fileId}/`;
        this.downloadService.downloadFile(downloadUrl, filename);
        this.toast.success('Descargando archivo...');
    }

    downloadFolder(): void {
        const data = this.sharedData();
        if (data?.folder) {
            // Download folder as ZIP using share token
            const downloadUrl = `/api/share-links/${this.shareToken()}/download-folder/`;
            this.downloadService.downloadFile(downloadUrl, `${data.folder.name}.zip`);
            this.toast.success('Descargando carpeta como ZIP...');
        }
    }

    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getThumbnailUrl(fileId: number): string {
        // Use public thumbnail endpoint with share token
        return `/api/share-links/${this.shareToken()}/thumbnail/${fileId}/`;
    }

    getPublicDownloadUrl(fileId: number): string {
        // Use public download endpoint with share token
        return `/api/share-links/${this.shareToken()}/download/${fileId}/`;
    }

    getFileIcon(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const icons: { [key: string]: string } = {
            'pdf': '📕',
            'doc': '📘', 'docx': '📘',
            'xls': '📗', 'xlsx': '📗',
            'ppt': '📙', 'pptx': '📙',
            'zip': '📦', 'rar': '📦', '7z': '📦',
            'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵',
            'mp4': '🎬', 'avi': '🎬', 'mkv': '🎬', 'mov': '🎬',
            'txt': '📝',
            'json': '📋', 'xml': '📋',
            'js': '💻', 'ts': '💻', 'py': '💻', 'html': '💻', 'css': '💻',
        };
        return icons[ext] || '📄';
    }

    goToLogin(): void {
        this.router.navigate(['/login'], {
            queryParams: { redirect: this.router.url }
        });
    }

    openPreview(file: any): void {
        this.selectedFile.set(file);
    }

    closePreview(): void {
        this.selectedFile.set(null);
    }

    // Gestión del estado de carga de imágenes
    onImageLoadingChange(fileId: number, isLoading: boolean): void {
        const current = new Set(this.loadingImages());
        if (isLoading) {
            current.add(fileId);
        } else {
            current.delete(fileId);
        }
        this.loadingImages.set(current);
    }

    isImageLoading(fileId: number): boolean {
        return this.loadingImages().has(fileId);
    }

    // Inicializa todas las imágenes como "cargando" al renderizar
    initImageLoading(fileId: number): void {
        const current = new Set(this.loadingImages());
        current.add(fileId);
        this.loadingImages.set(current);
    }
}
