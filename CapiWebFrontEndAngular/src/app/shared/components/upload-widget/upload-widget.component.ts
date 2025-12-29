import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { UploadService, UploadState, UploadTask } from '../../services/upload.service';

@Component({
  selector: 'app-upload-widget',
  standalone: true,
  imports: [
    CommonModule
  ],
  template: `
    <div *ngIf="uploadState && uploadState.isVisible && uploadState.totalFiles > 0" class="upload-widget" [class.expanded]="isExpanded" [class.collapsed]="!isExpanded" [class.hiding]="isHiding">
      <!-- Header principal -->
      <div class="widget-header" (click)="toggleExpanded()">
        <div class="progress-circle">
          <svg class="progress-ring" width="40" height="40">
            <circle
              class="progress-ring-background"
              stroke-width="3"
              fill="transparent"
              r="18"
              cx="20"
              cy="20"
            />
            <circle
              class="progress-ring-progress"
              stroke-width="3"
              fill="transparent"
              r="18"
              cx="20"
              cy="20"
              [style.stroke-dasharray]="circumference"
              [style.stroke-dashoffset]="dashOffset"
            />
          </svg>
          <div class="progress-text">{{ round(uploadState.overallProgress || 0) }}%</div>
        </div>
        
        <div class="header-info">
          <div class="title">Subiendo archivos</div>
          <div class="subtitle">
            {{ uploadState.completedFiles || 0 }}/{{ uploadState.totalFiles || 0 }} completados
            <span *ngIf="(uploadState.failedFiles || 0) > 0" class="error-count">
              ({{ uploadState.failedFiles }} errores)
            </span>
          </div>
        </div>
      </div>

      <!-- Lista expandible de archivos -->
      <div class="file-list" *ngIf="isExpanded">
        <div class="file-item" 
             *ngFor="let task of uploadState.tasks || []"
             [class.completed]="task.status === 'completed'"
             [class.error]="task.status === 'error'">
          <div class="file-info">
            <div class="file-name">{{ task.file.name }}</div>
            <div class="file-size">{{ formatFileSize(task.file.size) }}</div>
          </div>
          
          <div class="file-progress">
            <div class="progress-bar">
              <div class="progress-fill" 
                   [style.width.%]="task.progress"
                   [class.completed]="task.status === 'completed'"
                   [class.error]="task.status === 'error'">
              </div>
            </div>
            <div class="progress-status">
              <span *ngIf="task.status === 'pending'">Pendiente</span>
              <span *ngIf="task.status === 'uploading'">{{ round(task.progress) }}%</span>
              <span *ngIf="task.status === 'completed'" class="success">✓ Completado</span>
              <span *ngIf="task.status === 'error'" class="error">✗ Error</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Botón de cerrar -->
      <button class="close-btn" (click)="closeWidget(); $event.stopPropagation()">
        ✕
      </button>
    </div>
  `,
  styles: [`
    .upload-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(20, 20, 25, 0.95);
      backdrop-filter: blur(20px);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
      min-width: 320px;
      max-width: 400px;
      z-index: 9999;
      transition: all 0.3s ease;
      opacity: 1;
      transform: scale(1);
    }

    .upload-widget.hiding {
      opacity: 0;
      transform: scale(0.9);
      pointer-events: none;
    }

    .upload-widget.collapsed {
      min-width: 280px;
    }

    .widget-header {
      display: flex;
      align-items: center;
      padding: 16px;
      cursor: pointer;
      user-select: none;
    }

    .progress-circle {
      position: relative;
      margin-right: 16px;
    }

    .progress-ring {
      transform: rotate(-90deg);
    }

    .progress-ring-background {
      stroke: rgba(255, 255, 255, 0.1);
    }

    .progress-ring-progress {
      stroke: #00f2ff;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.3s ease;
    }

    .progress-text {
      position: absolute;
      top: 43%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 10px;
      font-weight: 600;
      color: #00f2ff;
    }

    .header-info {
      flex: 1;
    }

    .title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 2px;
    }

    .subtitle {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
    }

    .error-count {
      color: #ff4444;
      font-weight: 500;
    }

    .file-list {
      max-height: 300px;
      overflow-y: auto;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .file-item {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      transition: background 0.2s ease;
    }

    .file-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .file-item.completed {
      background: rgba(0, 242, 255, 0.05);
    }

    .file-item.error {
      background: rgba(255, 68, 68, 0.1);
    }

    .file-info {
      margin-bottom: 8px;
    }

    .file-name {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 2px;
      word-break: break-all;
    }

    .file-size {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
    }

    .file-progress {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-bar {
      flex: 1;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #00f2ff;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .progress-fill.completed {
      background: #00ff88;
    }

    .progress-fill.error {
      background: #ff4444;
    }

    .progress-status {
      font-size: 11px;
      min-width: 60px;
      text-align: right;
    }

    .success {
      color: #00ff88;
    }

    .error {
      color: #ff4444;
    }

    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      transition: all 0.2s ease;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }

    /* Scrollbar styling */
    .file-list::-webkit-scrollbar {
      width: 6px;
    }

    .file-list::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
    }

    .file-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }

    .file-list::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      .upload-widget {
        bottom: 10px;
        right: 10px;
        left: 10px;
        min-width: auto;
        max-width: none;
        z-index: 9999; /* Máima prioridad para estar por encima de todo */
      }
    }
  `]
})
export class UploadWidgetComponent implements OnInit, OnDestroy {
  uploadState$: Observable<UploadState>;
  uploadState: UploadState | null = null;
  isExpanded = false;
  isHiding = false;
  
  private destroy$ = new Subject<void>();
  circumference = 2 * Math.PI * 18; // 2πr donde r=18

  constructor(private uploadService: UploadService) {
    this.uploadState$ = this.uploadService.uploadState$;
  }

  ngOnInit(): void {
    this.uploadState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.uploadState = state;
        // Auto-expandir cuando hay archivos activos
        if (state.totalFiles > 0 && !state.isVisible) {
          this.isExpanded = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  closeWidget(): void {
    // Iniciar animación de desvanecimiento
    this.isHiding = true;
    
    // Esperar a que termine la animación antes de ocultar
    setTimeout(() => {
      this.uploadService.hideUploadWidget();
      this.isExpanded = false;
      this.isHiding = false;
    }, 300); // Duración de la animación
  }

  get dashOffset(): number {
    if (!this.uploadState) return this.circumference;
    const progress = this.uploadState.overallProgress / 100;
    return this.circumference - (progress * this.circumference);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  round(value: number): number {
    return Math.round(value);
  }
}
