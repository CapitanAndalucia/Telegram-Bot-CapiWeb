import { Directive, ElementRef, Input, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';

/**
 * Cola global para limitar peticiones concurrentes de imágenes.
 */
class ImageLoadQueue {
    private static readonly MAX_CONCURRENT = 2;
    private static readonly DELAY_MS = 200;
    private static activeCount = 0;
    private static queue: Array<() => void> = [];
    private static lastLoadTime = 0;

    static enqueue(loadFn: () => void): void {
        if (this.activeCount < this.MAX_CONCURRENT) {
            this.scheduleLoad(loadFn);
        } else {
            this.queue.push(loadFn);
        }
    }

    private static scheduleLoad(loadFn: () => void): void {
        const now = Date.now();
        const timeSinceLastLoad = now - this.lastLoadTime;
        const delay = Math.max(0, this.DELAY_MS - timeSinceLastLoad);

        this.activeCount++;

        setTimeout(() => {
            this.lastLoadTime = Date.now();
            loadFn();
        }, delay);
    }

    static complete(): void {
        this.activeCount--;
        if (this.queue.length > 0 && this.activeCount < this.MAX_CONCURRENT) {
            const next = this.queue.shift();
            if (next) {
                this.scheduleLoad(next);
            }
        }
    }
}

/**
 * Directiva para carga diferida de imágenes con retry automático.
 * 
 * - Muestra estado "loading" hasta que carga
 * - Si falla, reintenta después de 60 segundos
 * - Sin límite de reintentos (reintenta indefinidamente)
 */
@Directive({
    selector: '[appLazyLoad]',
    standalone: true
})
export class LazyLoadImageDirective implements OnInit, OnDestroy {
    @Input('appLazyLoad') lazySrc!: string;

    /** Si es true, la imagen está cargando o esperando retry */
    @Output() lazyLoading = new EventEmitter<boolean>();

    private observer?: IntersectionObserver;
    private hasLoaded = false;
    private isQueued = false;
    private retryTimeout?: ReturnType<typeof setTimeout>;
    private readonly RETRY_DELAY_MS = 60000; // 60 segundos = 1 minuto

    constructor(private el: ElementRef<HTMLImageElement>) { }

    ngOnInit(): void {
        if (!this.lazySrc) return;

        // Emitir que está en estado de carga inicialmente
        this.lazyLoading.emit(true);

        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting && !this.hasLoaded && !this.isQueued) {
                            this.queueImageLoad();
                        }
                    });
                },
                { rootMargin: '50px', threshold: 0 }
            );
            this.observer.observe(this.el.nativeElement);
        } else {
            this.queueImageLoad();
        }
    }

    private queueImageLoad(): void {
        if (this.isQueued || this.hasLoaded) return;

        this.isQueued = true;
        this.observer?.disconnect();

        ImageLoadQueue.enqueue(() => {
            this.loadImage();
        });
    }

    private loadImage(): void {
        if (this.hasLoaded) {
            ImageLoadQueue.complete();
            return;
        }

        const img = this.el.nativeElement;

        const onLoad = () => {
            this.hasLoaded = true;
            this.lazyLoading.emit(false); // Ya no está cargando
            ImageLoadQueue.complete();
            cleanup();
        };

        const onError = () => {
            ImageLoadQueue.complete();
            cleanup();

            // Siempre reintentar después de 60 segundos
            console.log(`[LazyLoad] Error cargando imagen. Reintentando en 60s...`);
            img.removeAttribute('src');
            this.lazyLoading.emit(true); // Sigue en estado de carga

            this.retryTimeout = setTimeout(() => {
                this.isQueued = false;
                this.queueImageLoad();
            }, this.RETRY_DELAY_MS);
        };

        const cleanup = () => {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
        };

        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
        img.src = this.lazySrc;
    }

    ngOnDestroy(): void {
        this.observer?.disconnect();
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
        }
    }
}
