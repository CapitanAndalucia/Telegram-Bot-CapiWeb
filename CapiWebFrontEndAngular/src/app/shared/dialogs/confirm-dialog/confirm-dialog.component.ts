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
            min-width: 320px;
        }
        :host ::ng-deep .mat-mdc-dialog-surface {
            background: #f7f8fb;
            border-radius: 18px;
            box-shadow: 0 20px 45px rgba(22, 28, 45, 0.18);
            border: 1px solid rgba(15, 23, 42, 0.08);
        }
        .dialog-root {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            color: #1f2933;
        }
        h2[mat-dialog-title] {
            margin: 0;
            font-size: 1.2rem;
            font-weight: 600;
            letter-spacing: 0.2px;
        }
        .dialog-content {
            font-size: 0.95rem;
            line-height: 1.5;
            color: #475467;
        }
        .message {
            margin: 0 0 0.3rem;
        }
        .detail {
            margin: 0;
            font-size: 0.88rem;
            color: #1f2933;
            font-weight: 500;
        }
        .dialog-actions {
            display: flex;
            gap: 0.75rem;
        }
        button[mat-button] {
            text-transform: none;
            color: #2563eb;
        }
        .action-button {
            text-transform: none;
            font-weight: 600;
            letter-spacing: 0.2px;
            padding: 0.4rem 1.2rem;
            border-radius: 999px;
            background: rgba(37, 99, 235, 0.12);
            color: #2563eb;
            transition: background 0.2s ease, color 0.2s ease;
        }
        .action-button:hover {
            background: rgba(37, 99, 235, 0.18);
        }
        .action-button.destructive {
            background: rgba(217, 48, 37, 0.12);
            color: #d93025;
        }
        .action-button.destructive:hover {
            background: rgba(217, 48, 37, 0.18);
        }
    `,
    ],
})
export class ConfirmDialogComponent {
    constructor(
        @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
        private dialogRef: MatDialogRef<ConfirmDialogComponent>
    ) {}

    onCancel(): void {
        this.dialogRef.close(false);
    }

    onConfirm(): void {
        this.dialogRef.close(true);
    }
}
