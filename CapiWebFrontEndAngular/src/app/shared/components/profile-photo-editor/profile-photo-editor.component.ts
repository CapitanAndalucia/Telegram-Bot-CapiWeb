import { Component, Input, Output, EventEmitter, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-profile-photo-editor',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './profile-photo-editor.component.html',
    styleUrls: ['./profile-photo-editor.component.css']
})
export class ProfilePhotoEditorComponent implements AfterViewInit {
    @Input() imageFile: File | null = null;
    @Output() apply = new EventEmitter<Blob>();
    @Output() cancel = new EventEmitter<void>();

    @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;

    private ctx: CanvasRenderingContext2D | null = null;
    private image: HTMLImageElement | null = null;
    private canvasSize = 300;

    // Transform state
    zoom = signal(1);
    rotation = signal(0);
    offsetX = signal(0);
    offsetY = signal(0);

    // Drag state
    private isDragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragOffsetStartX = 0;
    private dragOffsetStartY = 0;

    ngAfterViewInit(): void {
        this.setupCanvas();
        if (this.imageFile) {
            this.loadImage(this.imageFile);
        }
    }

    private setupCanvas(): void {
        const canvas = this.canvasRef.nativeElement;
        this.ctx = canvas.getContext('2d');
        canvas.width = this.canvasSize;
        canvas.height = this.canvasSize;
    }

    private loadImage(file: File): void {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.image = new Image();
            this.image.onload = () => {
                // Set initial zoom to fit image
                const minDim = Math.min(this.image!.width, this.image!.height);
                const initialZoom = this.canvasSize / minDim;
                this.zoom.set(Math.max(1, initialZoom));
                this.render();
            };
            this.image.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    }

    render(): void {
        if (!this.ctx || !this.image) return;

        const ctx = this.ctx;
        const canvas = this.canvasRef.nativeElement;

        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Save context
        ctx.save();

        // Move to center
        ctx.translate(canvas.width / 2, canvas.height / 2);

        // Apply rotation
        ctx.rotate((this.rotation() * Math.PI) / 180);

        // Apply zoom and offset
        const scale = this.zoom();
        const imgWidth = this.image.width * scale;
        const imgHeight = this.image.height * scale;

        ctx.drawImage(
            this.image,
            -imgWidth / 2 + this.offsetX(),
            -imgHeight / 2 + this.offsetY(),
            imgWidth,
            imgHeight
        );

        // Restore context
        ctx.restore();

        // Draw circular mask overlay
        this.drawCircularMask();
    }

    private drawCircularMask(): void {
        if (!this.ctx) return;

        const ctx = this.ctx;
        const canvas = this.canvasRef.nativeElement;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = (canvas.width / 2) - 10;

        // Create path for the corners (outside circle)
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.closePath();

        // Fill corners with semi-transparent dark
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fill();

        // Draw circle border
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // Zoom control
    onZoomChange(value: number): void {
        // Clamp zoom to minimum that keeps image covering circle
        const minZoom = this.getMinZoom();
        const clampedZoom = Math.max(minZoom, Math.min(3, value));
        this.zoom.set(clampedZoom);

        // Reclamp offset after zoom change
        const clamped = this.clampOffset(this.offsetX(), this.offsetY());
        this.offsetX.set(clamped.x);
        this.offsetY.set(clamped.y);

        this.render();
    }

    private getMinZoom(): number {
        if (!this.image) return 0.5;
        const radius = (this.canvasSize / 2) - 10;
        const diameter = radius * 2;
        const minDim = Math.min(this.image.width, this.image.height);
        return diameter / minDim;
    }

    // Rotation controls
    rotateLeft(): void {
        this.rotation.update(r => r - 90);
        this.render();
    }

    rotateRight(): void {
        this.rotation.update(r => r + 90);
        this.render();
    }

    // Pan/Drag handlers
    onMouseDown(event: MouseEvent): void {
        this.isDragging = true;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.dragOffsetStartX = this.offsetX();
        this.dragOffsetStartY = this.offsetY();
        event.preventDefault();
    }

    onMouseMove(event: MouseEvent): void {
        if (!this.isDragging) return;

        const dx = event.clientX - this.dragStartX;
        const dy = event.clientY - this.dragStartY;

        // Adjust for rotation
        const angle = (-this.rotation() * Math.PI) / 180;
        const rotatedDx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const rotatedDy = dx * Math.sin(angle) + dy * Math.cos(angle);

        const newX = this.dragOffsetStartX + rotatedDx;
        const newY = this.dragOffsetStartY + rotatedDy;

        // Clamp to keep image within circle
        const clamped = this.clampOffset(newX, newY);
        this.offsetX.set(clamped.x);
        this.offsetY.set(clamped.y);
        this.render();
    }

    private clampOffset(x: number, y: number): { x: number; y: number } {
        if (!this.image) return { x, y };

        const scale = this.zoom();
        const imgWidth = this.image.width * scale;
        const imgHeight = this.image.height * scale;
        const radius = (this.canvasSize / 2) - 10;

        // Calculate maximum allowed offset to keep image covering the circle
        // The image center is at canvas center + offset
        // We need the image edges to always be outside the circle
        const maxOffsetX = Math.max(0, (imgWidth / 2) - radius);
        const maxOffsetY = Math.max(0, (imgHeight / 2) - radius);

        return {
            x: Math.max(-maxOffsetX, Math.min(maxOffsetX, x)),
            y: Math.max(-maxOffsetY, Math.min(maxOffsetY, y))
        };
    }

    onMouseUp(): void {
        this.isDragging = false;
    }

    onMouseLeave(): void {
        this.isDragging = false;
    }

    // Touch handlers for mobile
    onTouchStart(event: TouchEvent): void {
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            this.isDragging = true;
            this.dragStartX = touch.clientX;
            this.dragStartY = touch.clientY;
            this.dragOffsetStartX = this.offsetX();
            this.dragOffsetStartY = this.offsetY();
            event.preventDefault();
        }
    }

    onTouchMove(event: TouchEvent): void {
        if (!this.isDragging || event.touches.length !== 1) return;

        const touch = event.touches[0];
        const dx = touch.clientX - this.dragStartX;
        const dy = touch.clientY - this.dragStartY;

        const angle = (-this.rotation() * Math.PI) / 180;
        const rotatedDx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const rotatedDy = dx * Math.sin(angle) + dy * Math.cos(angle);

        const newX = this.dragOffsetStartX + rotatedDx;
        const newY = this.dragOffsetStartY + rotatedDy;

        // Clamp to keep image within circle
        const clamped = this.clampOffset(newX, newY);
        this.offsetX.set(clamped.x);
        this.offsetY.set(clamped.y);
        this.render();
    }

    onTouchEnd(): void {
        this.isDragging = false;
    }

    // Apply cropped image
    onApply(): void {
        if (!this.image) return;

        // Create a new canvas for the cropped circular image
        const outputCanvas = document.createElement('canvas');
        const size = 256; // Output size
        outputCanvas.width = size;
        outputCanvas.height = size;
        const outputCtx = outputCanvas.getContext('2d');

        if (!outputCtx) return;

        // Create circular clip
        outputCtx.beginPath();
        outputCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        outputCtx.closePath();
        outputCtx.clip();

        // Scale factor for output
        const scaleFactor = size / this.canvasSize;

        // Draw image with same transforms
        outputCtx.translate(size / 2, size / 2);
        outputCtx.rotate((this.rotation() * Math.PI) / 180);

        const scale = this.zoom() * scaleFactor;
        const imgWidth = this.image.width * scale;
        const imgHeight = this.image.height * scale;

        outputCtx.drawImage(
            this.image,
            -imgWidth / 2 + this.offsetX() * scaleFactor,
            -imgHeight / 2 + this.offsetY() * scaleFactor,
            imgWidth,
            imgHeight
        );

        // Convert to blob and emit
        outputCanvas.toBlob((blob) => {
            if (blob) {
                this.apply.emit(blob);
            }
        }, 'image/png', 0.9);
    }

    onCancel(): void {
        this.cancel.emit();
    }
}
