import { Component, input, output, HostBinding, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FileItem {
    id: number;
    filename: string;
    size: number;
    created_at: string;
    is_viewed: boolean;
}

@Component({
    selector: 'app-file-preview-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './file-preview-modal.component.html',
    // Removed styleUrls as we are using Tailwind classes directly
})
export class FilePreviewModalComponent implements OnInit {
    file = input.required<FileItem>();

    // Optional custom URLs for shared/public access
    customDownloadUrl = input<string | null>(null);
    customStreamUrl = input<string | null>(null);

    close = output<void>();
    download = output<{ id: number; filename: string }>();
    delete = output<number>();
    share = output<FileItem>();

    @HostBinding('class.closing') isClosing = false;
    isOpening = true;

    // UI State
    showMoreMenu = false;
    zoomLevel = 1;

    ngOnInit() {
        setTimeout(() => {
            this.isOpening = false;
        }, 50);
    }

    get isImage(): boolean {
        return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(this.file().filename);
    }

    get isVideo(): boolean {
        return /\.(mp4|webm|ogg|avi|mov|wmv|flv|mkv|3gp|m4v|mpg|mpeg)$/i.test(this.file().filename);
    }

    get streamUrl(): string {
        // Use custom URL if provided, otherwise use authenticated endpoint
        return this.customStreamUrl() || `/api/transfers/${this.file().id}/download/`;
    }

    get downloadUrl(): string {
        // Use custom URL if provided, otherwise use authenticated endpoint
        return this.customDownloadUrl() || `/api/transfers/${this.file().id}/download/`;
    }

    onClose(): void {
        this.isClosing = true;
        setTimeout(() => {
            this.close.emit();
        }, 200);
    }

    onDownload(): void {
        this.download.emit({ id: this.file().id, filename: this.file().filename });
    }

    onDelete(): void {
        this.delete.emit(this.file().id);
    }

    onShare(): void {
        this.share.emit(this.file());
    }

    zoomIn(): void {
        this.zoomLevel = Math.min(this.zoomLevel + 0.25, 3);
    }

    zoomOut(): void {
        this.zoomLevel = Math.max(this.zoomLevel - 0.25, 0.25);
    }

    // Close on escape key could be added here
}
