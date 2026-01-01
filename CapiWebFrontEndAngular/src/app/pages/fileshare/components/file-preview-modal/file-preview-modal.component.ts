import { Component, input, output, HostBinding } from '@angular/core';
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
    imports: [CommonModule],
    templateUrl: './file-preview-modal.component.html',
    styleUrls: ['../../fileshare.component.css'],
})
export class FilePreviewModalComponent {
    file = input.required<FileItem>();

    // Optional custom URLs for shared/public access
    customDownloadUrl = input<string | null>(null);
    customStreamUrl = input<string | null>(null);

    close = output<void>();
    download = output<{ id: number; filename: string }>();
    delete = output<number>();

    @HostBinding('class.closing') isClosing = false;

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
        }, 250);
    }

    onDownload(): void {
        this.download.emit({ id: this.file().id, filename: this.file().filename });
    }

    onDelete(): void {
        this.delete.emit(this.file().id);
    }

    onOverlayClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.onClose();
        }
    }
}
