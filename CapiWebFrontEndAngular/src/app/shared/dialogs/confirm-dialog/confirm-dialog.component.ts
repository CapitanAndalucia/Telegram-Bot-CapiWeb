import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { NgIf } from '@angular/common';

export interface ConfirmDialogData {
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

@Component({
    selector: 'app-confirm-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, NgIf],
    template: `
        <div class="dialog-root" [class.destructive]="data.destructive">
            <h2 mat-dialog-title>{{ data.title }}</h2>
            <div mat-dialog-content class="dialog-content">
                <p class="message">{{ data.message }}</p>
                <p *ngIf="data.detail" class="detail">{{ data.detail }}</p>
            </div>
            <div mat-dialog-actions align="end" class="dialog-actions">
                <button mat-button type="button" (click)="onCancel()">{{ data.cancelLabel || 'Cancelar' }}</button>
                <button
                    mat-button
                    type="button"
                    (click)="onConfirm()"
                    class="action-button"
                    [class.destructive]="data.destructive"
                >
                    {{ data.confirmLabel || 'Aceptar' }}
                </button>
            </div>
        </div>
    `,
    styles: [
        `:host {
            display: block;
            
        }
        :host ::ng-deep .mat-mdc-dialog-surface {
            background: rgba(20, 20, 25, 0.95);
            backdrop-filter: blur(20px);
            border-radius: 16px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .dialog-root {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            color: #fff;
            padding: 0.5rem;
        }
        h2[mat-dialog-title] {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
            letter-spacing: 0.3px;
            color: #fff;
        }
        .dialog-content {
            font-size: 0.95rem;
            line-height: 1.6;
            color: rgba(255, 255, 255, 0.7);
        }
        .message {
            margin: 0 0 0.5rem;
        }
        .detail {
            margin: 0;
            padding: 0.75rem 1rem;
            font-size: 0.9rem;
            color: #fff;
            font-weight: 500;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .dialog-actions {
            display: flex;
            gap: 0.75rem;
            justify-content: flex-end;
            padding-top: 0.5rem;
        }
        button[mat-button] {
            text-transform: none;
            color: rgba(255, 255, 255, 0.7);
            border-radius: 8px;
            padding: 0.5rem 1rem;
            transition: all 0.2s ease;
        }
        button[mat-button]:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #fff;
        }
        .action-button {
            text-transform: none;
            font-weight: 600;
            letter-spacing: 0.2px;
            padding: 0.5rem 1.5rem;
            border-radius: 8px;
            background: linear-gradient(135deg, rgba(0, 242, 255, 0.2), rgba(139, 92, 246, 0.15));
            color: #00f2ff;
            border: 1px solid rgba(0, 242, 255, 0.3);
            transition: all 0.2s ease;
        }
        .action-button:hover {
            background: linear-gradient(135deg, rgba(0, 242, 255, 0.3), rgba(139, 92, 246, 0.25));
            box-shadow: 0 4px 15px rgba(0, 242, 255, 0.2);
        }
        .action-button.destructive {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.15));
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .action-button.destructive:hover {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.25));
            box-shadow: 0 4px 15px rgba(239, 68, 68, 0.2);
        }
    `,
    ],
})
export class ConfirmDialogComponent {
    constructor(
        @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
        private dialogRef: MatDialogRef<ConfirmDialogComponent>
    ) { }

    onCancel(): void {
        this.dialogRef.close(false);
    }

    onConfirm(): void {
        this.dialogRef.close(true);
    }
}
