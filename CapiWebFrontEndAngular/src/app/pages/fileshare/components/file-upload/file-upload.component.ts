import { Component, input, output, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../../../services/api-client.service';

interface User {
    username: string;
    email?: string;
    is_staff?: boolean;
}

@Component({
    selector: 'app-file-upload',
    imports: [CommonModule, FormsModule],
    templateUrl: './file-upload.component.html',
    styleUrls: ['../../fileshare.component.css'],
})
export class FileUploadComponent {
    user = input.required<User | null>();
    selectedRecipient = input<string>('');

    uploadSuccess = output<void>();
    recipientChange = output<string>();

    file = signal<File | null>(null);
    recipient = signal('');
    description = signal('');
    uploading = signal(false);
    error = signal('');
    sendToSelf = signal(false);

    constructor(private apiClient: ApiClientService) {
        // Sync with selectedRecipient from parent
        effect(() => {
            const selected = this.selectedRecipient();
            const currentUser = this.user();
            if (selected) {
                this.recipient.set(selected);
                this.sendToSelf.set(selected === currentUser?.username);
            }
        });
    }

    handleFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            this.file.set(input.files[0]);
        }
    }

    handleSelfToggle(event: Event): void {
        const checkbox = event.target as HTMLInputElement;
        const isChecked = checkbox.checked;
        this.sendToSelf.set(isChecked);

        if (isChecked && this.user()) {
            const username = this.user()!.username;
            this.recipient.set(username);
            this.recipientChange.emit(username);
        } else {
            this.recipient.set('');
            this.recipientChange.emit('');
        }
    }

    handleRecipientChange(value: string): void {
        this.recipient.set(value);
        this.recipientChange.emit(value);
        if (this.sendToSelf() && value !== this.user()?.username) {
            this.sendToSelf.set(false);
        }
    }

    async handleSubmit(event: Event): Promise<void> {
        event.preventDefault();
        event.stopPropagation();
        
        // Guardar la posición actual del scroll
        const scrollY = window.scrollY;
        
        if (!this.file() || !this.recipient()) return;

        this.uploading.set(true);
        this.error.set('');

        try {
            const formData = new FormData();
            formData.append('file', this.file()!);
            formData.append('recipient_username', this.recipient());
            if (this.description()) {
                formData.append('description', this.description());
            }

            await this.apiClient.uploadFile(formData);
            this.uploadSuccess.emit();

            // Reset form
            this.file.set(null);
            this.recipient.set('');
            this.description.set('');
            this.sendToSelf.set(false);
            this.recipientChange.emit('');

            // Reset file input
            const fileInput = document.querySelector(
                'input[type="file"]'
            ) as HTMLInputElement;
            if (fileInput) {
                fileInput.value = '';
            }
            
            // Restaurar la posición del scroll
            setTimeout(() => {
                window.scrollTo(0, scrollY);
            }, 0);
            
        } catch (err: any) {
            this.error.set(err.payload?.error || 'Error al subir archivo');
        } finally {
            this.uploading.set(false);
        }
    }
}
