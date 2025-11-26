// Security configuration access for frontend
// This mirrors the backend security_config.json

let securityConfig = null;

export async function loadSecurityConfig() {
    if (securityConfig) {
        return securityConfig;
    }

    try {
        const response = await fetch('/security_config.json');
        securityConfig = await response.json();
        return securityConfig;
    } catch (error) {
        console.error('Failed to load security config:', error);
        // Fallback to default config
        return getDefaultConfig();
    }
}

function getDefaultConfig() {
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

export function getAllowedExtensions(config) {
    const extensions = [];
    for (const category of Object.values(config.file_validation.allowed_extensions)) {
        extensions.push(...category);
    }
    return extensions;
}

export function getBlockedExtensions(config) {
    return config.file_validation.blocked_extensions;
}

export function isFileAllowed(filename, config) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    const allowed = getAllowedExtensions(config);
    const blocked = getBlockedExtensions(config);

    if (blocked.includes(ext)) {
        return { allowed: false, reason: 'Archivo bloqueado por seguridad' };
    }

    if (!allowed.includes(ext)) {
        return { allowed: false, reason: 'Tipo de archivo no permitido' };
    }

    return { allowed: true };
}

export function validateFileSize(size, config) {
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
