import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpResponse, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Subscription, interval } from 'rxjs';
import { ApiClientService } from '../../services/api-client.service';

export interface DownloadItem {
    id: string;
    filename: string;
    progress: number; // 0-100
    state: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'ERROR' | 'CANCELLED';
    loaded: number;
    total: number;
    speed: string; // e.g., "1.2 MB/s"
    subscription?: Subscription;
    startTimestamp: number;
    lastLoaded: number;
    lastTimestamp: number;
    type: 'FILE' | 'FOLDER';
}

@Injectable({
    providedIn: 'root'
})
export class DownloadService {
    private http = inject(HttpClient);
    private downloadsSubject = new BehaviorSubject<DownloadItem[]>([]);
    public downloads$ = this.downloadsSubject.asObservable();

    // To handle speed calculation
    private speedIntervalSub: Subscription | null = null;

    constructor() {
        // Start speed calculation interval
        this.speedIntervalSub = interval(1000).subscribe(() => {
            this.updateSpeeds();
        });
    }

    private updateSpeeds() {
        const now = Date.now();
        const currentDownloads = this.downloadsSubject.value;
        let activeDownloads = false;

        const updatedDownloads = currentDownloads.map(item => {
            if (item.state === 'DOWNLOADING') {
                activeDownloads = true;
                const timeDiff = (now - item.lastTimestamp) / 1000; // seconds
                if (timeDiff > 0) {
                    const bytesDiff = item.loaded - item.lastLoaded;
                    const speedBytesPerSec = bytesDiff / timeDiff;
                    item.speed = this.formatSpeed(speedBytesPerSec);

                    // Update checkpoints
                    item.lastLoaded = item.loaded;
                    item.lastTimestamp = now;
                }
            } else if (item.state === 'COMPLETED' || item.state === 'ERROR' || item.state === 'CANCELLED') {
                item.speed = '';
            }
            return item;
        });

        // Only update subject if there was a change (optimization could be better but this is fine)
        if (activeDownloads) {
            // We don't necessarily need to emit new array if we just mutated objects inside, 
            // but to trigger change detection in OnPush components usually we should.
            // However, for frequent updates, mutating and relying on default strategy or signal is common.
            // Let's emit to be safe.
            this.downloadsSubject.next([...updatedDownloads]);
        }
    }

    downloadFile(url: string, filename: string) {
        this.startDownload(url, filename, 'FILE');
    }

    downloadFolder(url: string, filename: string) {
        this.startDownload(url, filename, 'FOLDER');
    }

    private startDownload(url: string, filename: string, type: 'FILE' | 'FOLDER') {
        const id = this.generateId();
        const newItem: DownloadItem = {
            id,
            filename,
            progress: 0,
            state: 'PENDING',
            loaded: 0,
            total: 0,
            speed: '0 KB/s',
            startTimestamp: Date.now(),
            lastLoaded: 0,
            lastTimestamp: Date.now(),
            type
        };

        this.addDownload(newItem);

        // Use custom request configuration to listen for events
        const req = this.http.get(url, {
            reportProgress: true,
            observe: 'events',
            responseType: 'blob'
        });

        const sub = req.subscribe({
            next: (event: HttpEvent<Blob>) => {
                this.handleEvent(id, event);
            },
            error: (err) => {
                console.error('Download error', err);
                this.updateDownload(id, { state: 'ERROR', progress: 0 });
            },
            complete: () => {
                // Should have been handled in HttpResponse event
            }
        });

        this.updateDownload(id, { subscription: sub, state: 'DOWNLOADING' });
    }

    private handleEvent(id: string, event: HttpEvent<Blob>) {
        switch (event.type) {
            case HttpEventType.ResponseHeader:
                // Try to get content length
                let total = 0;
                const lenHeader = event.headers.get('Content-Length');
                const xTotalHeader = event.headers.get('X-Total-Size'); // For folders

                if (lenHeader) {
                    total = parseInt(lenHeader, 10);
                } else if (xTotalHeader) {
                    total = parseInt(xTotalHeader, 10);
                }

                if (total > 0) {
                    this.updateDownload(id, { total });
                }
                break;

            case HttpEventType.DownloadProgress:
                if (event.loaded) {
                    const changes: Partial<DownloadItem> = { loaded: event.loaded };

                    // If we have total, calc progress
                    // For folders (Chunked), event.total might be undefined or undefined.
                    // If we grabbed total from headers, use it.
                    const currentItem = this.getDownload(id);
                    let currentTotal = currentItem?.total || event.total || 0;

                    if (currentTotal > 0) {
                        // Cap at 99% until fully done if it is an estimation
                        let percent = Math.round((event.loaded / currentTotal) * 100);
                        if (percent > 100) percent = 100;
                        changes.progress = percent;
                    }

                    this.updateDownload(id, changes);
                }
                break;

            case HttpEventType.Response:
                // Done
                this.updateDownload(id, { state: 'COMPLETED', progress: 100, loaded: event.body?.size || 0 });
                this.triggerFileSave(event.body!, this.getDownload(id)!.filename);

                // Remove from list after a delay or keep it? User wants a menu.
                // We keep it until user dismisses or we can auto-remove after 10s.
                // For now, keep it.
                break;
        }
    }

    private triggerFileSave(blob: Blob, filename: string) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    cancelDownload(id: string) {
        const item = this.getDownload(id);
        if (item && item.state === 'DOWNLOADING' && item.subscription) {
            item.subscription.unsubscribe();
            this.updateDownload(id, { state: 'CANCELLED' });
        } else {
            // If already done or error, just remove from list
            this.removeDownload(id);
        }
    }

    clearCompleted() {
        const current = this.downloadsSubject.value;
        const active = current.filter(item => item.state === 'DOWNLOADING' || item.state === 'PENDING');
        this.downloadsSubject.next(active);
    }

    // Helpers
    private getDownload(id: string): DownloadItem | undefined {
        return this.downloadsSubject.value.find(d => d.id === id);
    }

    private addDownload(item: DownloadItem) {
        this.downloadsSubject.next([...this.downloadsSubject.value, item]);
    }

    private updateDownload(id: string, changes: Partial<DownloadItem>) {
        const current = this.downloadsSubject.value;
        const index = current.findIndex(d => d.id === id);
        if (index !== -1) {
            const updated = { ...current[index], ...changes };
            const newArr = [...current];
            newArr[index] = updated;
            this.downloadsSubject.next(newArr);
        }
    }

    private removeDownload(id: string) {
        const current = this.downloadsSubject.value;
        this.downloadsSubject.next(current.filter(d => d.id !== id));
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }

    private formatSpeed(bytesPerSecond: number): string {
        if (bytesPerSecond === 0) return '0 KB/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
        return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}
