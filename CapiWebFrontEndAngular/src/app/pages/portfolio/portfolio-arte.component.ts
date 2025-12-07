import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, inject, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViceCityBackgroundComponent } from './vice-city-background.component';
import { ApiClientService } from '../../services/api-client.service';

interface Drawing {
    id: number;
    imagen: string;
    descripcion: string;
    palabras_clave: string;
    pin: boolean;
}

interface FormData {
    descripcion: string;
    imagen: File | null;
    palabras_clave: string;
}

@Component({
    selector: 'app-portfolio-arte',
    standalone: true,
    imports: [CommonModule, FormsModule, ViceCityBackgroundComponent],
    templateUrl: './portfolio-arte.component.html',
    styleUrls: ['./portfolio-arte.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class PortfolioArteComponent implements OnInit, OnDestroy {
    private apiClient = inject(ApiClientService);
    private cdr = inject(ChangeDetectorRef);

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

    activeSection: 'gallery' | 'about' | 'contact' = 'gallery';
    drawings: Drawing[] = [];
    currentPage = 1;
    hasMore = true;
    loading = false;
    lightboxOpen = false;
    lightboxImage = '';
    modalOpen = false;
    editingDrawing: Drawing | null = null;
    formData: FormData = {
        descripcion: '',
        imagen: null,
        palabras_clave: ''
    };
    imagePreview: string | null = null;
    isStaff = false;

    ngOnInit(): void {
        this.setVH();
        this.init();
    }

    ngOnDestroy(): void {
        // Cleanup if needed
    }

    @HostListener('window:resize')
    onResize(): void {
        this.setVH();
    }

    @HostListener('window:scroll')
    onScroll(): void {
        const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
        if (nearBottom && !this.loading && this.hasMore) {
            this.loadDrawings(false);
        }
    }

    private setVH(): void {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    private async init(): Promise<void> {
        try {
            const authData = await this.apiClient.checkAuth();
            this.isStaff = authData?.is_staff || false;
        } catch (error) {
            console.log('No autenticado o error al verificar auth');
        }
        this.loadDrawings(true);
    }

    loadDrawings(initial = false): void {
        if (this.loading || (!initial && !this.hasMore)) return;

        this.loading = true;
        const page = initial ? 1 : this.currentPage;

        this.apiClient.listDibujos({ page, page_size: 6 }).subscribe({
            next: (data) => {
                const items = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : []);

                if (initial) {
                    this.drawings = items;
                    this.currentPage = 1;
                } else {
                    this.drawings = [...this.drawings, ...items];
                }

                // Actualizar paginación
                if (data.next) {
                    this.hasMore = true;
                    this.currentPage = this.currentPage + 1;
                } else {
                    this.hasMore = false;
                }

                this.loading = false;

                // Forzar detección de cambios
                this.cdr.detectChanges();
            },
            error: (e) => {
                console.error('Error cargando dibujos', e);
                this.loading = false;
            }
        });
    }

    openLightbox(src: string): void {
        this.lightboxImage = src;
        this.lightboxOpen = true;
        this.cdr.detectChanges();
    }

    closeLightbox(): void {
        this.lightboxOpen = false;
        this.cdr.detectChanges();
        setTimeout(() => {
            this.lightboxImage = '';
            this.cdr.detectChanges();
        }, 250);
    }

    handleLightboxClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (target.classList.contains('lightbox')) {
            this.closeLightbox();
        }
    }

    handleSectionChange(section: 'gallery' | 'about' | 'contact'): void {
        this.activeSection = section;
        this.cdr.detectChanges();
    }

    openModal(drawing: Drawing | null = null): void {
        if (drawing) {
            this.editingDrawing = drawing;
            this.formData = {
                descripcion: drawing.descripcion || '',
                imagen: null,
                palabras_clave: drawing.palabras_clave || ''
            };
            this.imagePreview = drawing.imagen;
        } else {
            this.editingDrawing = null;
            this.formData = {
                descripcion: '',
                imagen: null,
                palabras_clave: ''
            };
            this.imagePreview = null;
        }
        this.modalOpen = true;
        this.cdr.detectChanges();
    }

    closeModal(): void {
        this.modalOpen = false;
        this.editingDrawing = null;
        this.formData = {
            descripcion: '',
            imagen: null,
            palabras_clave: ''
        };
        this.imagePreview = null;
        this.cdr.detectChanges();
    }

    onFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            this.formData.imagen = file;

            // Crear vista previa
            const reader = new FileReader();
            reader.onloadend = () => {
                this.imagePreview = reader.result as string;
                this.cdr.detectChanges();
            };
            reader.readAsDataURL(file);
        }
    }

    triggerFileInput(): void {
        this.fileInput.nativeElement.click();
    }

    handleSubmit(event: Event): void {
        event.preventDefault();

        const data = new FormData();
        data.append('descripcion', this.formData.descripcion);
        data.append('palabras_clave', this.formData.palabras_clave);

        // Solo añadir imagen si realmente se seleccionó un archivo nuevo
        if (this.formData.imagen && this.formData.imagen instanceof File) {
            data.append('imagen', this.formData.imagen);
        }

        if (this.editingDrawing) {
            this.apiClient.updateDibujo(this.editingDrawing.id, data).subscribe({
                next: () => {
                    this.closeModal();
                    this.loadDrawings(true);
                },
                error: (error) => {
                    console.error('Error saving drawing:', error);
                    alert('Error al guardar el dibujo');
                }
            });
        } else {
            this.apiClient.createDibujo(data).subscribe({
                next: () => {
                    this.closeModal();
                    this.loadDrawings(true);
                },
                error: (error) => {
                    console.error('Error saving drawing:', error);
                    alert('Error al guardar el dibujo');
                }
            });
        }
    }

    handleDelete(id: number): void {
        if (confirm('¿Estás seguro de que quieres eliminar este dibujo?')) {
            this.apiClient.deleteDibujo(id).subscribe({
                next: () => {
                    this.loadDrawings(true);
                },
                error: (error) => {
                    console.error('Error deleting drawing:', error);
                    alert('Error al eliminar el dibujo');
                }
            });
        }
    }

    handleTogglePin(id: number, currentPinStatus: boolean): void {
        const data = new FormData();
        data.append('pin', (!currentPinStatus).toString());

        this.apiClient.patchDibujo(id, data).subscribe({
            next: () => {
                this.loadDrawings(true);
            },
            error: (error) => {
                console.error('Error toggling pin:', error);
                alert('Error al cambiar el estado de pin');
            }
        });
    }

    onImageLoad(event: Event): void {
        const img = event.target as HTMLImageElement;
        img.classList.add('img-loaded');
    }

    trackByDrawingId(index: number, drawing: Drawing): number {
        return drawing.id;
    }
}
