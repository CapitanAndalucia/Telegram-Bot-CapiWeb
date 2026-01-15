import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-confirm-modal',
    standalone: true,
    imports: [CommonModule],
    template: `
        @if (isOpen) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4" (click)="onBackdropClick($event)">
            <!-- Backdrop -->
            <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
            
            <!-- Modal -->
            <div class="relative bg-[#1d3627] rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-white/10 animate-modal-in">
                <!-- Icon -->
                <div class="flex justify-center mb-4">
                    <div class="flex size-16 items-center justify-center rounded-full" 
                         [class]="variant === 'danger' ? 'bg-red-500/20' : 'bg-[#13ec6a]/20'">
                        <span class="material-symbols-outlined text-3xl"
                              [class]="variant === 'danger' ? 'text-red-500' : 'text-[#13ec6a]'">
                            {{ icon }}
                        </span>
                    </div>
                </div>
                
                <!-- Title -->
                <h3 class="text-xl font-bold text-white text-center mb-2">{{ title }}</h3>
                
                <!-- Message -->
                <p class="text-[#9cacba] text-center mb-6">{{ message }}</p>
                
                <!-- Buttons -->
                <div class="flex gap-3">
                    <button (click)="onCancel()" 
                            class="flex-1 py-3 px-4 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors">
                        {{ cancelText }}
                    </button>
                    <button (click)="onConfirm()" 
                            class="flex-1 py-3 px-4 rounded-xl font-semibold transition-colors"
                            [class]="variant === 'danger' 
                                ? 'bg-red-500 text-white hover:bg-red-600' 
                                : 'bg-[#13ec6a] text-[#102217] hover:bg-[#0fb650]'">
                        {{ confirmText }}
                    </button>
                </div>
            </div>
        </div>
        }
    `,
    styles: [`
        @keyframes modal-in {
            from {
                opacity: 0;
                transform: scale(0.95) translateY(10px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }
        
        .animate-modal-in {
            animation: modal-in 200ms ease-out forwards;
        }
    `]
})
export class ConfirmModalComponent {
    @Input() isOpen = false;
    @Input() title = 'Confirmar';
    @Input() message = '¿Estás seguro?';
    @Input() confirmText = 'Confirmar';
    @Input() cancelText = 'Cancelar';
    @Input() variant: 'danger' | 'default' = 'default';
    @Input() icon = 'warning';

    @Output() confirmed = new EventEmitter<void>();
    @Output() cancelled = new EventEmitter<void>();

    onConfirm(): void {
        this.confirmed.emit();
    }

    onCancel(): void {
        this.cancelled.emit();
    }

    onBackdropClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.onCancel();
        }
    }
}
