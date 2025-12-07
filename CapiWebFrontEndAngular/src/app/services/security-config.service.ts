import { Injectable } from '@angular/core';

export interface SecurityConfig {
    file_validation: {
        max_file_size_gb: number;
        allowed_extensions: {
            images: string[];
            audio: string[];
            video: string[];
            archives: string[];
            documents: string[];
        };
        blocked_extensions: string[];
    };
}

@Injectable({
    providedIn: 'root'
})
export class SecurityConfigService {
    private config: SecurityConfig | null = null;

    async loadConfig(): Promise<SecurityConfig> {
        if (this.config) {
            return this.config;
        }

        try {
            const response = await fetch('/security_config.json');
            this.config = await response.json();
            return this.config!;
        } catch (error) {
            console.error('Failed to load security config:', error);
            this.config = this.getDefaultConfig();
            return this.config;
        }
    }

    private getDefaultConfig(): SecurityConfig {
        return {
            file_validation: {
                max_file_size_gb: 30,
                allowed_extensions: {
                    images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'],
                    audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'],
                    video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
                    archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
                    documents: ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
                },
                blocked_extensions: [
                    '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.app', '.deb', '.rpm',
                    '.jar', '.vbs', '.js', '.wsf', '.scr', '.com', '.pif'
                ]
            }
        };
    }

    getAllowedExtensions(config: SecurityConfig): string[] {
        const extensions: string[] = [];
        for (const category of Object.values(config.file_validation.allowed_extensions)) {
            extensions.push(...category);
        }
        return extensions;
    }

    getBlockedExtensions(config: SecurityConfig): string[] {
        return config.file_validation.blocked_extensions;
    }

    isFileAllowed(filename: string, config: SecurityConfig): { allowed: boolean; reason?: string } {
        const ext = '.' + filename.split('.').pop()?.toLowerCase();
        const allowed = this.getAllowedExtensions(config);
        const blocked = this.getBlockedExtensions(config);

        if (blocked.includes(ext)) {
            return { allowed: false, reason: 'Archivo bloqueado por seguridad' };
        }

        if (!allowed.includes(ext)) {
            return { allowed: false, reason: 'Tipo de archivo no permitido' };
        }

        return { allowed: true };
    }

    validateFileSize(size: number, config: SecurityConfig): { valid: boolean; message?: string } {
        const maxSizeBytes = config.file_validation.max_file_size_gb * 1024 * 1024 * 1024;
        if (size > maxSizeBytes) {
            const sizeGB = (size / (1024 * 1024 * 1024)).toFixed(2);
            const maxGB = config.file_validation.max_file_size_gb;
            return {
                valid: false,
                message: `Archivo demasiado grande (${sizeGB} GB). Máximo: ${maxGB} GB`
            };
        }
        return { valid: true };
    }
}
