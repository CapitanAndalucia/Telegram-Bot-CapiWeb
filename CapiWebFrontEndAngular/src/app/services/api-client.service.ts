/**
 * api-client.service.ts
 * ====================
 * 
 * Servicio principal para comunicación con la API REST del backend.
 * 
 * Este servicio centraliza todas las llamadas HTTP al backend Django,
 * proporcionando métodos tipados para cada recurso de la API.
 * 
 * Características:
 * - Autenticación automática mediante cookies HTTP-only
 * - Manejo centralizado de errores
 * - Soporte para subida de archivos con progreso
 * - Conversión automática de respuestas JSON
 * 
 * Módulos de la API:
 * - Auth: Registro, login, logout, verificación de sesión
 * - Dibujos: CRUD de galería de arte
 * - Proyectos/Tecnologías: Portfolio profesional
 * - Tickets: Gestión de gastos
 * - Social: Amigos y solicitudes
 * - Transfers: Gestión de archivos y carpetas
 * - Notifications: Sistema de notificaciones
 * - Share Links: Enlaces para compartir archivos
 * 
 * @example
 * // Inyección del servicio
 * constructor(private apiClient: ApiClientService) {}
 * 
 * // Uso de métodos
 * await this.apiClient.login({ username: 'user', password: 'pass' });
 * const files = await this.apiClient.listFiles();
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiError } from '../models/api-error';

/** URL base por defecto para la API */
const DEFAULT_BASE_URL = '/api';

/**
 * Servicio cliente HTTP para comunicación con el backend.
 * 
 * Proporciona métodos para todas las operaciones de la API REST,
 * con manejo automático de autenticación y errores.
 * 
 * @remarks
 * - Todas las peticiones incluyen credenciales (cookies) automáticamente
 * - Los errores se transforman en objetos ApiError consistentes
 * - Soporta tanto Observable como Promise según el caso de uso
 */
@Injectable({
    providedIn: 'root'
})
export class ApiClientService {
    private http = inject(HttpClient);
    private baseUrl: string;

    /**
     * Constructor del servicio.
     * 
     * Inicializa la URL base de la API. Si existe una variable global
     * `window.__API_BASE_URL`, la usa; de lo contrario, usa '/api'.
     */
    constructor() {
        // Check for global API base URL or use default
        this.baseUrl = (typeof window !== 'undefined' && (window as any).__API_BASE_URL)
            ? (window as any).__API_BASE_URL.replace(/\/$/, '')
            : DEFAULT_BASE_URL;
    }

    /**
     * Construye una URL completa con parámetros de query.
     * 
     * @param path - Ruta del endpoint (ej: '/auth/login/')
     * @param params - Objeto con parámetros de query opcionales
     * @returns URL completa con query string si hay parámetros
     * 
     * @example
     * buildUrl('/tickets/', { fecha__gte: '2024-01-01' })
     * // Retorna: '/api/tickets/?fecha__gte=2024-01-01'
     */
    private buildUrl(path: string, params?: Record<string, any>): string {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const baseUrl = this.baseUrl;

        if (!params || Object.keys(params).length === 0) {
            const finalUrl = `${baseUrl}${normalizedPath}`;
            return finalUrl;
        }

        const httpParams = new HttpParams({ fromObject: params });
        const query = httpParams.toString();
        const finalUrl = query ? `${baseUrl}${normalizedPath}?${query}` : `${baseUrl}${normalizedPath}`;
        return finalUrl;
    }

    /**
     * Maneja errores HTTP y los transforma en ApiError.
     * 
     * Procesa diferentes tipos de errores según el código de estado:
     * - 0: Error de conexión
     * - 403: Errores de permisos (con mensajes específicos)
     * - 500: Errores del servidor
     * - Otros: Extrae mensaje del cuerpo de respuesta
     * 
     * @param error - Objeto de error HTTP de Angular
     * @returns Observable que emite un ApiError
     */
    private handleError(error: HttpErrorResponse): Observable<never> {
        let errorMessage = 'An unknown error occurred';

        if (error.status === 0) {
            errorMessage = 'Error de conexión o el servidor no responde';
        } else if (error.status === 500) {
            errorMessage = 'Error interno del servidor';
            if (error.error && typeof error.error === 'string') {
                errorMessage = error.error;
            } else if (error.error?.error) {
                errorMessage = error.error.error;
            }
        } else if (error.status === 403) {
            // Handle specific permission errors
            if (error.error?.error === 'insufficient_permissions') {
                errorMessage = error.error?.message || 'No tienes permisos suficientes para realizar esta acción';
            } else if (error.error?.error === 'cannot_remove_original') {
                errorMessage = error.error?.message || 'No puedes eliminar al usuario original que compartió este archivo';
            } else if (error.error?.error) {
                errorMessage = error.error.error;
            } else {
                errorMessage = 'No tienes permisos para realizar esta acción';
            }
        } else if (error.error?.error) {
            errorMessage = error.error.error;
        } else if (error.statusText) {
            errorMessage = error.statusText;
        }

        return throwError(() => new ApiError(errorMessage, error.status, error.error));
    }

    /**
     * Método genérico para realizar peticiones HTTP.
     * 
     * Este es el método base utilizado por todos los demás métodos del servicio.
     * Configura automáticamente headers, credenciales y manejo de errores.
     * 
     * @typeParam T - Tipo de respuesta esperada
     * @param path - Ruta del endpoint
     * @param method - Método HTTP (GET, POST, PUT, PATCH, DELETE)
     * @param options - Opciones adicionales de la petición
     * @param options.data - Cuerpo de la petición (para POST/PUT/PATCH)
     * @param options.params - Parámetros de query
     * @param options.headers - Headers personalizados
     * @param options.responseType - Tipo de respuesta ('json', 'blob', etc.)
     * @param options.silent - Si true, no lanza error en 401
     * @returns Observable con la respuesta tipada
     * 
     * @example
     * // Petición GET simple
     * request<User[]>('/users/', 'GET')
     * 
     * // Petición POST con datos
     * request<LoginResponse>('/auth/login/', 'POST', { data: credentials })
     */
    private request<T>(
        path: string,
        method: string = 'GET',
        options: {
            data?: any;
            params?: Record<string, any>;
            headers?: HttpHeaders;
            responseType?: any;
            silent?: boolean;
        } = {}
    ): Observable<T> {
        const url = this.buildUrl(path, options.params);

        const silent = options.silent || false;
        const httpOptions: any = {
            headers: options.headers || new HttpHeaders({ 'Content-Type': 'application/json' }),
            withCredentials: true,
            responseType: options.responseType || 'json'
        };

        let request$: Observable<any>;

        switch (method.toUpperCase()) {
            case 'GET':
                request$ = this.http.get<T>(url, httpOptions);
                break;
            case 'POST':
                request$ = this.http.post<T>(url, options.data, httpOptions);
                break;
            case 'PUT':
                request$ = this.http.put<T>(url, options.data, httpOptions);
                break;
            case 'PATCH':
                request$ = this.http.patch<T>(url, options.data, httpOptions);
                break;
            case 'DELETE':
                request$ = this.http.delete<T>(url, httpOptions);
                break;
            default:
                return throwError(() => new Error(`Unsupported HTTP method: ${method}`));
        }

        return request$.pipe(catchError((error) => {
            if (silent && error.status === 401) {
                return throwError(() => new ApiError('Unauthorized (silent)', 401));
            }
            return this.handleError(error);
        }));
    }

    // ==================== AUTENTICACIÓN ====================

    /**
     * Registra un nuevo usuario en el sistema.
     * 
     * @param data - Datos del nuevo usuario
     * @param data.username - Nombre de usuario único
     * @param data.password - Contraseña
     * @param data.email - Email opcional
     * @returns Observable con datos del usuario creado o error
     * 
     * Endpoint: POST /api/auth/register/
     */
    register(data: { username: string; password: string; email?: string }): Observable<any> {
        return this.request('/auth/register/', 'POST', { data });
    }

    login(data: { username: string; password: string }): Observable<any> {
        return this.request('/auth/login/', 'POST', { data });
    }

    logout(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/auth/logout/', 'POST').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    refresh(): Observable<any> {
        return this.request('/auth/refresh/', 'POST');
    }

    checkAuth(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/auth/check/', 'GET', { silent: true }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    // ---- Dibujos -------------------------------------------------------------
    listDibujos(params?: Record<string, any>): Observable<any> {
        return this.request('/dibujos/', 'GET', { params });
    }

    getDibujo(id: number): Observable<any> {
        return this.request(`/dibujos/${id}/`, 'GET');
    }

    createDibujo(formData: FormData): Observable<any> {
        return this.http.post(`${this.baseUrl}/dibujos/`, formData, {
            withCredentials: true
        }).pipe(catchError(this.handleError));
    }

    updateDibujo(id: number, formData: FormData): Observable<any> {
        return this.http.put(`${this.baseUrl}/dibujos/${id}/`, formData, {
            withCredentials: true
        }).pipe(catchError(this.handleError));
    }

    patchDibujo(id: number, formData: FormData): Observable<any> {
        return this.http.patch(`${this.baseUrl}/dibujos/${id}/`, formData, {
            withCredentials: true
        }).pipe(catchError(this.handleError));
    }

    deleteDibujo(id: number): Observable<any> {
        return this.request(`/dibujos/${id}/`, 'DELETE');
    }

    // ---- Proyectos -------------------------------------------------------------
    listProyectos(params?: Record<string, any>): Observable<any> {
        return this.request('/proyectos/', 'GET', { params });
    }

    getProyecto(id: number): Observable<any> {
        return this.request(`/proyectos/${id}/`, 'GET');
    }

    // ---- Tecnologías -----------------------------------------------------------
    listTecnologias(params?: Record<string, any>): Observable<any> {
        return this.request('/tecnologias/', 'GET', { params });
    }

    getTecnologia(id: number): Observable<any> {
        return this.request(`/tecnologias/${id}/`, 'GET');
    }
    listTickets(params?: Record<string, any>): Observable<any> {
        return this.request('/tickets/', 'GET', { params });
    }

    getTicket(id: number): Observable<any> {
        return this.request(`/tickets/${id}/`, 'GET');
    }

    createTicket(data: any): Observable<any> {
        return this.request('/tickets/', 'POST', { data });
    }

    updateTicket(id: number, data: any): Observable<any> {
        return this.request(`/tickets/${id}/`, 'PUT', { data });
    }

    patchTicket(id: number, data: any): Observable<any> {
        return this.request(`/tickets/${id}/`, 'PATCH', { data });
    }

    deleteTicket(id: number): Observable<any> {
        return this.request(`/tickets/${id}/`, 'DELETE');
    }

    totalTicketsEntreFechas(inicio: string, fin: string): Observable<any> {
        return this.request('/tickets/total_entre_fechas/', 'GET', {
            params: { inicio, fin }
        });
    }

    // ---- Portfolio Photo -----------------------------------------------------
    getPortfolioPhoto(): Observable<any> {
        return this.request('/portfolio-photo/', 'GET');
    }

    savePortfolioPhoto(formData: FormData): Observable<any> {
        return this.http.post(`${this.baseUrl}/portfolio-photo/`, formData, {
            withCredentials: true
        }).pipe(catchError(this.handleError));
    }

    // ---- Telegram utilities (requiere admin) ---------------------------------
    getTelegramUser(username: string): Observable<any> {
        return this.request('/telegram/user/', 'GET', { params: { username } });
    }

    listTelegramProfiles(): Observable<any> {
        return this.request('/telegram/profiles/', 'GET');
    }

    // ---- User detail ---------------------------------------------------------
    getUserDetail(userId: number): Observable<any> {
        return this.request(`/users/${userId}/`, 'GET');
    }

    updateUserDetail(userId: number, data: any): Observable<any> {
        return this.request(`/users/${userId}/`, 'PATCH', { data });
    }

    // ---- Social --------------------------------------------------------------
    listFriends(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/friends/', 'GET').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    searchUsers(query: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/friends/search_users/', 'GET', { params: { q: query } }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    sendFriendRequest(username: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/friends/send_request/', 'POST', { data: { username } }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    removeFriend(username: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/friends/remove_friend/', 'POST', { data: { username } }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    listFriendRequests(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/friends/requests/', 'GET').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    acceptFriendRequest(id: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/friends/${id}/accept_request/`, 'POST').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    rejectFriendRequest(id: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/friends/${id}/reject_request/`, 'POST').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    // ---- Profile Photo -------------------------------------------------------
    uploadProfilePhoto(imageBlob: Blob): Promise<any> {
        const formData = new FormData();
        formData.append('image', imageBlob, 'profile.png');

        return new Promise((resolve, reject) => {
            this.http.post(`${this.baseUrl}/friends/upload_profile_photo/`, formData, {
                withCredentials: true
            }).pipe(catchError(this.handleError.bind(this))).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    removeProfilePhoto(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/friends/remove_profile_photo/', 'POST').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    // ---- Transfers -----------------------------------------------------------
    listFiles(folderId?: number | null, scope: 'mine' | 'shared' | 'sent' = 'mine'): Promise<any> {
        const params: any = { scope };
        if (folderId !== undefined) {
            params.folder = folderId;
        } else {
            params.folder = 'null';
        }
        return new Promise((resolve, reject) => {
            this.request('/transfers/', 'GET', { params }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    uploadFile(formData: FormData, onProgress?: (progress: any) => void): Promise<any> {
        // For file uploads with progress, we need to use a different approach
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress({
                        loaded: e.loaded,
                        total: e.total
                    });
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        reject(new ApiError('Invalid JSON response', xhr.status, xhr.responseText));
                    }
                } else {
                    try {
                        const error = JSON.parse(xhr.responseText);
                        reject(new ApiError(error.error || xhr.statusText, xhr.status, error));
                    } catch (e) {
                        reject(new ApiError(xhr.statusText, xhr.status, xhr.responseText));
                    }
                }
            });

            xhr.addEventListener('error', () => {
                reject(new ApiError('Network error', 0, null));
            });

            xhr.open('POST', `${this.baseUrl}/transfers/`);
            xhr.withCredentials = true;
            xhr.send(formData);
        });
    }

    downloadFile(id: number): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.request<Blob>(`/transfers/${id}/download/`, 'GET', {
                responseType: 'blob'
            }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    markFileViewed(id: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/transfers/${id}/mark_viewed/`, 'POST').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    deleteFile(id: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/transfers/${id}/delete_file/`, 'DELETE').subscribe({
                next: (data) => {
                    // Para DELETE, usualmente esperamos respuesta vacía o success
                    resolve(data || { success: true });
                },
                error: (err) => {
                    reject(err);
                }
            });
        });
    }

    checkArchive(id: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/transfers/${id}/check_archive/`, 'GET').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    // ---- Workouts ------------------------------------------------------------
    listRoutines(): Observable<any> {
        return this.request('/workouts/routines/', 'GET');
    }

    getRoutine(id: number): Observable<any> {
        return this.request(`/workouts/routines/${id}/`, 'GET');
    }

    createRoutine(data: any): Observable<any> {
        return this.request('/workouts/routines/', 'POST', { data });
    }

    updateRoutine(id: number, data: any): Observable<any> {
        return this.request(`/workouts/routines/${id}/`, 'PATCH', { data });
    }

    deleteRoutine(id: number): Observable<any> {
        return this.request(`/workouts/routines/${id}/`, 'DELETE');
    }

    // ---- Routine Days ---------------------------------------------------------
    createRoutineDay(data: any): Observable<any> {
        return this.request('/workouts/routine-days/', 'POST', { data });
    }

    updateRoutineDay(id: number, data: any): Observable<any> {
        return this.request(`/workouts/routine-days/${id}/`, 'PATCH', { data });
    }

    deleteRoutineDay(id: number): Observable<any> {
        return this.request(`/workouts/routine-days/${id}/`, 'DELETE');
    }

    // ---- Routine Exercises ----------------------------------------------------
    createRoutineExercise(data: any): Observable<any> {
        return this.request('/workouts/routine-exercises/', 'POST', { data });
    }

    updateRoutineExercise(id: number, data: any): Observable<any> {
        return this.request(`/workouts/routine-exercises/${id}/`, 'PATCH', { data });
    }

    deleteRoutineExercise(id: number): Observable<any> {
        return this.request(`/workouts/routine-exercises/${id}/`, 'DELETE');
    }

    getRoutineExercise(id: number): Observable<any> {
        return this.request(`/workouts/routine-exercises/${id}/`, 'GET');
    }

    getRoutineExerciseProgress(id: number): Observable<any> {
        return this.request(`/workouts/routine-exercises/${id}/progress/`, 'GET');
    }

    createExerciseSet(data: FormData): Observable<any> {
        return this.http.post(`${this.baseUrl}/workouts/sets/`, data, {
            withCredentials: true
        }).pipe(catchError(this.handleError));
    }

    deleteExerciseSet(id: number): Observable<any> {
        return this.request(`/workouts/sets/${id}/`, 'DELETE');
    }

    // ---- Exercise Library ----------------------------------------------------
    listExercises(name?: string): Observable<any> {
        const params = name ? { name } : undefined;
        return this.request('/workouts/exercises/', 'GET', { params });
    }

    getOrCreateExercise(data: {
        name: string;
        description?: string;
        default_sets?: number;
        default_reps?: number;
        default_weight?: number;
    }): Observable<any> {
        return this.request('/workouts/exercises/get_or_create/', 'POST', { data });
    }

    searchExercises(query: string): Observable<any> {
        return this.request('/workouts/exercises/', 'GET', { params: { name: query } });
    }

    updateExercise(id: number, data: any): Observable<any> {
        return this.request(`/workouts/exercises/${id}/`, 'PATCH', { data });
    }

    // ---- Routine Day Images ---------------------------------------------------
    uploadRoutineDayImage(dayId: number, imageFile: File): Observable<any> {
        const formData = new FormData();
        formData.append('image', imageFile);
        return this.http.post(
            `${this.baseUrl}/workouts/routine-days/${dayId}/upload_image/`,
            formData,
            { withCredentials: true }
        ).pipe(catchError(this.handleError));
    }

    deleteRoutineDayImage(dayId: number): Observable<any> {
        return this.request(`/workouts/routine-days/${dayId}/delete_image/`, 'DELETE');
    }

    // ---- Exercise Images ------------------------------------------------------
    uploadExerciseImages(exerciseId: number, imageFiles: File[]): Observable<any> {
        const formData = new FormData();
        imageFiles.forEach(file => {
            formData.append('images', file);
        });
        return this.http.post(
            `${this.baseUrl}/workouts/exercises/${exerciseId}/upload_images/`,
            formData,
            { withCredentials: true }
        ).pipe(catchError(this.handleError));
    }

    deleteExerciseImage(exerciseId: number, mediaId: number): Observable<any> {
        return this.request(`/workouts/exercises/${exerciseId}/delete_image/${mediaId}/`, 'DELETE');
    }

    // ---- Folders -------------------------------------------------------------
    listFolders(parentId?: number, scope?: 'mine' | 'shared' | 'sent'): Promise<any> {
        const params: any = {};
        if (parentId !== undefined) {
            params.parent = parentId;
        } else {
            params.parent = 'null';
        }
        if (scope) {
            params.scope = scope;
        }
        return new Promise((resolve, reject) => {
            this.request('/folders/', 'GET', { params }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }



    createFolder(name: string, parentId?: number): Promise<any> {
        const data: any = {
            name,
            parent: parentId ?? null
        };
        return new Promise((resolve, reject) => {
            this.request('/folders/', 'POST', { data }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    renameFolder(id: number, name: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/folders/${id}/`, 'PATCH', { data: { name } }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    renameFile(id: number, filename: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/transfers/${id}/`, 'PATCH', { data: { filename } }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    deleteFolder(id: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/folders/${id}/delete_folder/`, 'DELETE').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    downloadFolder(id: number): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.request<Blob>(`/folders/${id}/download/`, 'GET', {
                responseType: 'blob'
            }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    downloadMultiple(formData: FormData): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.http.post('/api/transfers/download_multiple/', formData, {
                responseType: 'blob',
                withCredentials: true
            }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    getFolder(id: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/folders/${id}/`, 'GET').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    moveFileToFolder(fileId: number, folderId: number | null): Promise<any> {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            if (folderId !== null && folderId !== undefined) {
                // backend expects 'folder_id' for the move endpoint
                formData.append('folder_id', folderId.toString());
            } else {
                formData.append('folder_id', '');
            }

            this.http.post(`${this.baseUrl}/transfers/${fileId}/move/`, formData, {
                withCredentials: true
            }).pipe(catchError(this.handleError)).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    moveFolderToFolder(folderId: number, parentId: number | null): Promise<any> {
        const payload: any = { parent: parentId ?? null };
        return new Promise((resolve, reject) => {
            this.request(`/folders/${folderId}/`, 'PATCH', { data: payload }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    // ---- Notifications -------------------------------------------------------
    listNotifications(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/notifications/', 'GET').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    markNotificationRead(id: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/notifications/${id}/mark_read/`, 'POST').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    markAllNotificationsRead(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/notifications/mark_all_read/', 'POST').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }
    listFileAccess(fileId: number): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.request(`/transfers/${fileId}/access/`, 'GET').subscribe({
                next: (data) => {
                    const payload: any = data;
                    if (Array.isArray(payload)) {
                        resolve(payload);
                    } else if (payload && Array.isArray(payload.results)) {
                        resolve(payload.results);
                    } else {
                        resolve([]);
                    }
                },
                error: (err) => reject(err)
            });
        });
    }

    shareFile(fileId: number, username: string, permission: 'read' | 'edit' = 'read', expires_at?: string | null): Promise<any> {
        const payload: any = { username, permission };
        if (expires_at) {
            payload.expires_at = expires_at;
        }
        return new Promise((resolve, reject) => {
            this.request(`/transfers/${fileId}/access/`, 'POST', { data: payload }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    revokeFileAccess(fileId: number, userId: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.request(`/transfers/${fileId}/access/${userId}/`, 'DELETE').subscribe({
                next: () => resolve(),
                error: (err) => reject(err)
            });
        });
    }

    listFolderAccess(folderId: number): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.request(`/folders/${folderId}/access/`, 'GET').subscribe({
                next: (data) => {
                    const payload: any = data;
                    if (Array.isArray(payload)) {
                        resolve(payload);
                    } else if (payload && Array.isArray(payload.results)) {
                        resolve(payload.results);
                    } else {
                        resolve([]);
                    }
                },
                error: (err) => reject(err)
            });
        });
    }

    shareFolder(folderId: number, username: string, permission: 'read' | 'edit' = 'read', propagate: boolean = true, expires_at?: string | null): Promise<any> {
        const payload: any = { username, permission, propagate };
        if (expires_at) {
            payload.expires_at = expires_at;
        }
        return new Promise((resolve, reject) => {
            this.request(`/folders/${folderId}/access/`, 'POST', { data: payload }).subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    revokeFolderAccess(folderId: number, userId: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.request(`/folders/${folderId}/access/${userId}/`, 'DELETE').subscribe({
                next: () => resolve(),
                error: (err) => reject(err)
            });
        });
    }

    markFolderContentsViewed(folderId: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/folders/${folderId}/mark_contents_viewed/`, 'POST').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }

    // ---- Share Links ---------------------------------------------------------

    createShareLink(data: {
        file?: number;
        folder?: number;
        access_type: 'anyone' | 'user';
        permission: 'read' | 'edit';
        specific_user?: number;
        expires_at?: string;
    }): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request('/share-links/', 'POST', { data }).subscribe({
                next: (res) => resolve(res),
                error: (err) => reject(err)
            });
        });
    }

    getShareLinksForItem(type: 'file' | 'folder', itemId: number): Promise<any[]> {
        const param = type === 'file' ? `file_id=${itemId}` : `folder_id=${itemId}`;
        return new Promise((resolve, reject) => {
            this.request(`/share-links/for-item/?${param}`, 'GET').subscribe({
                next: (data: any) => {
                    resolve(Array.isArray(data) ? data : data.results || []);
                },
                error: (err) => reject(err)
            });
        });
    }

    revokeShareLink(linkId: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.request(`/share-links/${linkId}/`, 'DELETE').subscribe({
                next: () => resolve(),
                error: (err) => reject(err)
            });
        });
    }

    accessShareLink(token: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.request(`/share-links/${token}/access/`, 'GET').subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
            });
        });
    }
}
