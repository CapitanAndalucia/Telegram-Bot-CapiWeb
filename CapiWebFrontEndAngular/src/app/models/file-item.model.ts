export interface FileItem {
    id: number;
    filename: string;
    size: number;
    created_at: string;
    is_viewed: boolean;
    uploader?: number;
    owner?: number;
    uploader_username?: string;
    owner_username?: string;
    has_access?: boolean;
    access_list?: FileAccess[];
    folder?: number | null;
}

export interface Folder {
    id: number;
    name: string;
    owner: number;
    owner_username?: string;
    uploader?: number;
    uploader_username?: string;
    parent: number | null;
    created_at: string;
    access_list?: FolderAccess[];
}

export interface FileAccess {
    id: number;
    granted_to: number;
    granted_to_username: string;
    granted_by: number | null;
    granted_by_username: string | null;
    permission: 'read' | 'edit';
    created_at: string;
    expires_at?: string | null;
}

export interface FolderAccess {
    id: number;
    granted_to: number;
    granted_to_username: string;
    granted_by: number | null;
    granted_by_username: string | null;
    permission: 'read' | 'edit';
    propagate: boolean;
    created_at: string;
    expires_at?: string | null;
}
