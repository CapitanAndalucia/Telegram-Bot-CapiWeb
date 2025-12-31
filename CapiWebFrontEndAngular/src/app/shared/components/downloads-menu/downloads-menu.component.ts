import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DownloadService, DownloadItem } from '../../services/download.service';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-downloads-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="downloads.length > 0" class="download-widget" [class.expanded]="isExpanded" [class.collapsed]="!isExpanded" [class.hiding]="isHiding">
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
          <div class="progress-text">{{ overallProgress }}%</div>
        </div>
        
        <div class="header-info">
          <div class="title">Descargas activas</div>
          <div class="subtitle">
            {{ activeDownloadsCount }} en progreso
            <span *ngIf="completedDownloadsCount > 0">
              ({{ completedDownloadsCount }} completados)
            </span>
          </div>
        </div>
      </div>

      <!-- Lista expandible de archivos -->
      <div class="file-list" *ngIf="isExpanded">
        <div class="file-item" 
             *ngFor="let item of downloads"
             [class.completed]="item.state === 'COMPLETED'"
             [class.error]="item.state === 'ERROR'"
             [class.cancelled]="item.state === 'CANCELLED'">
             
          <div class="file-info-row">
            <div class="file-info">
                <div class="file-name" [title]="item.filename">{{ item.filename }}</div>
                <div class="file-meta">
                    <span class="file-speed" *ngIf="item.state === 'DOWNLOADING'">{{ item.speed }}</span>
                    <span class="file-size" *ngIf="item.total > 0 && item.state !== 'DOWNLOADING'">{{ formatFileSize(item.loaded) }} / {{ formatFileSize(item.total) }}</span>
                    <span class="file-size" *ngIf="item.total === 0 && item.state !== 'DOWNLOADING'">{{ formatFileSize(item.loaded) }}</span>
                </div>
            </div>
            
            <button class="action-btn" *ngIf="item.state === 'DOWNLOADING'" (click)="cancelDownload(item.id); $event.stopPropagation()" title="Cancelar">
                ✕
            </button>
          </div>
          
          <div class="file-progress">
            <div class="progress-bar">
              <div class="progress-fill" 
                   [style.width.%]="item.progress"
                   [class.completed]="item.state === 'COMPLETED'"
                   [class.error]="item.state === 'ERROR' || item.state === 'CANCELLED'">
              </div>
            </div>
            <div class="progress-status">
              <span *ngIf="item.state === 'PENDING'">Pendiente</span>
              <span *ngIf="item.state === 'DOWNLOADING'">{{ item.progress }}%</span>
              <span *ngIf="item.state === 'COMPLETED'" class="success">✓ Listo</span>
              <span *ngIf="item.state === 'ERROR'" class="error">✗ Error</span>
              <span *ngIf="item.state === 'CANCELLED'" class="error">Cancelado</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Botón de cerrar (limpiar completados) -->
      <button class="close-btn" (click)="closeWidget(); $event.stopPropagation()" title="Ocultar y limpiar completados">
        ✕
      </button>
    </div>
  `,
  styles: [`
    .download-widget {
      position: fixed;
      bottom: 20px; /* Same as upload widget, might overlap if both active. Maybe move to left or stack? */
      left: 20px;   /* Let's put downloads on the LEFT to avoid collision with uploads on RIGHT */
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

    .download-widget.hiding {
      opacity: 0;
      transform: scale(0.9);
      pointer-events: none;
    }

    .download-widget.collapsed {
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
      stroke: #00f2ff; /* Cyan for downloads too, or maybe Green? Let's keep consistent theme */
      stroke-linecap: round;
      transition: stroke-dashoffset 0.3s ease;
    }

    .progress-text {
      position: absolute;
      top: 41%;
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

    .file-info-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
    }

    .file-info {
        flex: 1;
        min-width: 0; /* Text truncation */
    }

    .file-name {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-meta {
        display: flex;
        gap: 8px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
    }

    .action-btn {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        padding: 4px;
        font-size: 14px;
    }
    .action-btn:hover {
        color: #ff4444;
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

    .progress-fill.error, .progress-fill.cancelled {
      background: #ff4444;
    }

    .progress-status {
      font-size: 11px;
      min-width: 60px;
      text-align: right;
    }

    .success { color: #00ff88; }
    .error { color: #ff4444; }

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

    /* Mobile responsive */
    @media (max-width: 768px) {
      .download-widget {
        bottom: 80px; /* Stack above bottom nav/actions if any */
        left: 10px;
        right: auto;
        min-width: auto;
        width: calc(100% - 20px);
        max-width: 350px;
      }
    }
  `]
})
export class DownloadsMenuComponent implements OnInit, OnDestroy {
  downloads: DownloadItem[] = [];
  isExpanded = true;
  isHiding = false;
  circumference = 2 * Math.PI * 18;

  private destroy$ = new Subject<void>();

  constructor(private downloadService: DownloadService) { }

  ngOnInit(): void {
    this.downloadService.downloads$
      .pipe(takeUntil(this.destroy$))
      .subscribe(downloads => {
        this.downloads = downloads;
        // Auto-show logic if needed, but handled by *ngIf in template
        if (downloads.length > 0 && !this.isHiding) {
          // Maybe auto expand if new download starts?
          // For now, default expanded
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleExpanded() {
    this.isExpanded = !this.isExpanded;
  }

  closeWidget() {
    this.isHiding = true;
    setTimeout(() => {
      this.downloadService.clearCompleted();
      // If downloads remain (active ones), show again? Or hide completely?
      // clearCompleted() removes only finished ones.
      // If there are still active downloads, widget should reappear or stay? 
      // The *ngIf="downloads.length > 0" handles visibility.
      // If we want to hide even with active downloads, we need local state 'isVisible'.
      // But user probably just wants to dismiss completed ones.
      this.isHiding = false;
    }, 300);
  }

  cancelDownload(id: string) {
    this.downloadService.cancelDownload(id);
  }

  get overallProgress(): number {
    const active = this.downloads.filter(d => d.state === 'DOWNLOADING' || d.state === 'PENDING');
    if (active.length === 0) return 100;
    const totalProgress = active.reduce((acc, curr) => acc + curr.progress, 0);
    return Math.round(totalProgress / active.length);
  }

  get activeDownloadsCount(): number {
    return this.downloads.filter(d => d.state === 'DOWNLOADING' || d.state === 'PENDING').length;
  }

  get completedDownloadsCount(): number {
    return this.downloads.filter(d => d.state === 'COMPLETED').length;
  }

  get dashOffset(): number {
    const progress = this.overallProgress / 100;
    return this.circumference - (progress * this.circumference);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
