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

    close = output<void>();
    download = output<{ id: number; filename: string }>();
    delete = output<number>();

    @HostBinding('class.closing') isClosing = false;

    get isImage(): boolean {
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(this.file().filename);
    }

    get downloadUrl(): string {
        return `/api/transfers/${this.file().id}/download/`;
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
