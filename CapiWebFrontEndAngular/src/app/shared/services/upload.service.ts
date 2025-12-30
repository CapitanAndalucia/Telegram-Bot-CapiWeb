import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiClientService } from '../../services/api-client.service';

export interface UploadTask {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface UploadState {
  tasks: UploadTask[];
  isVisible: boolean;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  overallProgress: number;
  currentUser?: string;
  currentFolder?: number;
  currentFolderOwner?: number;
}

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  private uploadStateSubject = new BehaviorSubject<UploadState>({
    tasks: [],
    isVisible: false,
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    overallProgress: 0
  });

  public uploadState$ = this.uploadStateSubject.asObservable();
  
  // Nuevo: Subject para notificar cuando todas las subidas se completan
  private allUploadsCompletedSubject = new BehaviorSubject<void>(undefined);
  public allUploadsCompleted$ = this.allUploadsCompletedSubject.asObservable();
  
  private originalScrollY = 0;

  constructor(private apiClient: ApiClientService) {
    // Prevenir scroll durante subidas
    this.setupScrollPrevention();
  }

  private setupScrollPrevention(): void {
    // Guardar la posición del scroll antes de cualquier subida
  }

  // Método para establecer el contexto de subida
  setUploadContext(username: string, folderId?: number, folderOwnerId?: number): void {
    const currentState = this.uploadStateSubject.value;
    this.uploadStateSubject.next({
      ...currentState,
      currentUser: username,
      currentFolder: folderId,
      currentFolderOwner: folderOwnerId
    });
  }

  // Método para iniciar subida de múltiples archivos
  uploadFiles(files: File[]): void {
    // Guardar posición actual del scroll
    this.originalScrollY = window.scrollY;
    
    const newTasks: UploadTask[] = files.map(file => ({
      id: this.generateId(),
      file,
      progress: 0,
      status: 'pending' as const
    }));

    const currentState = this.uploadStateSubject.value;
    const updatedState: UploadState = {
      ...currentState,
      tasks: [...currentState.tasks, ...newTasks],
      isVisible: true,
      totalFiles: currentState.totalFiles + files.length
    };

    this.uploadStateSubject.next(updatedState);

    // Iniciar cada subida
    newTasks.forEach(task => this.processUpload(task));
  }

  // Procesa la subida real de un archivo
  private async processUpload(task: UploadTask): Promise<void> {
    this.updateTaskStatus(task.id, 'uploading');
    
    // Bloquear scroll durante la subida
    this.freezeScroll();

    try {
      const currentState = this.uploadStateSubject.value;
      
      const formData = new FormData();
      formData.append('file', task.file);
      formData.append('recipient_username', currentState.currentUser || 'unknown');

      if (currentState.currentFolder) {
        formData.append('folder', currentState.currentFolder.toString());
        
        // Enviar el owner de la carpeta para herencia de propiedad
        if (currentState.currentFolderOwner) {
          formData.append('owner', currentState.currentFolderOwner.toString());
        }
      }

      await this.apiClient.uploadFile(formData, (progressEvent: any) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        this.updateTaskProgress(task.id, percentCompleted);
      });
      
      this.updateTaskStatus(task.id, 'completed');
      this.incrementCompleted();
    } catch (error: any) {
      console.error('Upload failed', error);
      let errorMessage = 'Error al subir el archivo';
      if (error.payload && error.payload.file) {
        errorMessage = error.payload.file;
      } else if (error.message) {
        errorMessage = error.message;
      }
      this.updateTaskStatus(task.id, 'error', errorMessage);
      this.incrementFailed();
    } finally {
      // Desbloquear scroll después de la subida
      this.unfreezeScroll();
    }

    this.checkIfAllCompleted();
  }

  private freezeScroll(): void {
    // Guardar posición actual
    this.originalScrollY = window.scrollY;
    // Bloquear scroll
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this.originalScrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }

  private unfreezeScroll(): void {
    // Restaurar scroll
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, this.originalScrollY);
  }

  // Ejemplo con HttpClient real (descomenta y adapta):
  /*
  private uploadFileToServer(task: UploadTask): Observable<any> {
    const formData = new FormData();
    formData.append('file', task.file);

    return this.http.post('tu-api/upload', formData, {
      reportProgress: true,
      observe: 'events'
    }).pipe(
      tap(event => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          const progress = (event.loaded / event.total) * 100;
          this.updateTaskProgress(task.id, progress);
        } else if (event.type === HttpEventType.Response) {
          this.updateTaskStatus(task.id, 'completed');
          this.incrementCompleted();
        }
      }),
      catchError(error => {
        this.updateTaskStatus(task.id, 'error', error.message);
        this.incrementFailed();
        return throwError(() => error);
      })
    );
  }
  */

  private updateTaskProgress(taskId: string, progress: number): void {
    const state = this.uploadStateSubject.value;
    const updatedTasks = state.tasks.map(task =>
      task.id === taskId ? { ...task, progress: Math.min(progress, 100) } : task
    );

    // Calcular el nuevo progreso general
    const newOverallProgress = this.calculateOverallProgress(updatedTasks);

    this.uploadStateSubject.next({
      ...state,
      tasks: updatedTasks,
      overallProgress: newOverallProgress
    });
  }

  private updateTaskStatus(
    taskId: string,
    status: UploadTask['status'],
    error?: string
  ): void {
    const state = this.uploadStateSubject.value;
    const updatedTasks = state.tasks.map(task =>
      task.id === taskId ? { ...task, status, error, progress: status === 'completed' ? 100 : task.progress } : task
    );

    // Calcular el nuevo progreso general
    const newOverallProgress = this.calculateOverallProgress(updatedTasks);

    this.uploadStateSubject.next({
      ...state,
      tasks: updatedTasks,
      overallProgress: newOverallProgress
    });
  }

  private incrementCompleted(): void {
    const state = this.uploadStateSubject.value;
    this.uploadStateSubject.next({
      ...state,
      completedFiles: state.completedFiles + 1
    });
  }

  private incrementFailed(): void {
    const state = this.uploadStateSubject.value;
    this.uploadStateSubject.next({
      ...state,
      failedFiles: state.failedFiles + 1
    });
  }

  private calculateOverallProgress(tasks: UploadTask[]): number {
    if (tasks.length === 0) return 0;
    
    // Calcular progreso basado en todos los archivos
    const totalProgress = tasks.reduce((sum, task) => {
      let taskProgress = 0;
      
      switch (task.status) {
        case 'completed':
          taskProgress = 100;
          break;
        case 'uploading':
          taskProgress = task.progress;
          break;
        case 'pending':
          taskProgress = 0;
          break;
        case 'error':
          taskProgress = 0; // Los errores no cuentan para el progreso
          break;
      }
      
      return sum + taskProgress;
    }, 0);
    
    // Calcular porcentaje sobre el total de archivos
    const overallPercentage = totalProgress / tasks.length;
    
    return Math.min(Math.round(overallPercentage), 100);
  }

  private checkIfAllCompleted(): void {
    const state = this.uploadStateSubject.value;
    const allDone = state.tasks.every(
      task => task.status === 'completed' || task.status === 'error'
    );

    if (allDone) {
      // Restaurar posición del scroll
      this.restoreScrollPosition();
      
      // Notificar que todas las subidas se completaron
      this.allUploadsCompletedSubject.next();
      
      // Auto-ocultar después de 3 segundos
      setTimeout(() => this.hideUploadWidget(), 3000);
    }
  }

  private restoreScrollPosition(): void {
    // Restaurar la posición guardada del scroll
    setTimeout(() => {
      window.scrollTo({
        top: this.originalScrollY,
        left: 0,
        behavior: 'instant'
      });
    }, 0);
  }

  hideUploadWidget(): void {
    this.uploadStateSubject.next({
      tasks: [],
      isVisible: false,
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      overallProgress: 0
    });
  }

  toggleVisibility(): void {
    const state = this.uploadStateSubject.value;
    this.uploadStateSubject.next({
      ...state,
      isVisible: !state.isVisible
    });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
