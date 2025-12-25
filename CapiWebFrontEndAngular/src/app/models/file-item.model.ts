export interface FileItem {
    id: number;
    filename: string;
    size: number;
    created_at: string;
    is_viewed: boolean;
    sender_username?: string;
    recipient_username?: string;
    is_shared_copy?: boolean;
    folder?: number | null;
}

export interface Folder {
    id: number;
    name: string;
    owner: number;
    parent: number | null;
    created_at: string;
}
