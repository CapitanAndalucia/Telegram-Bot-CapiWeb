import { Component, Inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { NgIf } from '@angular/common';

export interface InputDialogData {
    title: string;
    label: string;
    placeholder?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    initialValue?: string;
    validator?: (value: string) => string | null;
}

@Component({
    selector: 'app-input-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule, NgIf],
    template: `
        <div class="dialog-root">
            <h2 mat-dialog-title>{{ data.title }}</h2>
            <form mat-dialog-content (ngSubmit)="onSubmit()" class="dialog-form">
                <mat-form-field appearance="outline" class="full-width">
                    <mat-label>{{ data.label }}</mat-label>
                    <input matInput [placeholder]="data.placeholder ?? ''" [formControl]="inputControl" />
                    <mat-error *ngIf="inputControl.hasError('required')">
                        Este campo es obligatorio
                    </mat-error>
                    <mat-error *ngIf="inputControl.hasError('customError')">
                        {{ inputControl.getError('customError') }}
                    </mat-error>
                </mat-form-field>
            </form>
            <div mat-dialog-actions align="end" class="dialog-actions">
                <button mat-button type="button" (click)="onCancel()">{{ data.cancelLabel || 'Cancelar' }}</button>
                <button
                    mat-button
                    type="button"
                    (click)="onSubmit()"
                    [disabled]="inputControl.invalid"
                    class="action-button"
                >
                    {{ data.confirmLabel || 'Guardar' }}
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
            gap: 1.4rem;
            color: #1f2933;
        }
        h2[mat-dialog-title] {
            margin: 0;
            font-size: 1.2rem;
            font-weight: 600;
            letter-spacing: 0.2px;
        }
        .dialog-form {
            margin: 0;
            display: block;
        }
        .full-width {
            width: 100%;
        }
        :host ::ng-deep .mat-mdc-form-field-flex {
            border-radius: 12px;
        }
        :host ::ng-deep .mdc-notched-outline__leading,
        :host ::ng-deep .mdc-notched-outline__trailing {
            border-color: rgba(37, 99, 235, 0.35) !important;
        }
        :host ::ng-deep .mat-mdc-form-field-focus-overlay {
            background: rgba(37, 99, 235, 0.08);
        }
        :host ::ng-deep .mat-mdc-form-field-subscript-wrapper {
            margin-top: 0.4rem;
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
        .action-button:disabled {
            background: rgba(148, 163, 184, 0.2);
            color: rgba(148, 163, 184, 0.9);
        }
    `,
    ],
})
export class InputDialogComponent {
    inputControl = new FormControl('', { nonNullable: true, validators: [Validators.required] });

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: InputDialogData,
        private dialogRef: MatDialogRef<InputDialogComponent>
    ) {
        if (data.initialValue) {
            this.inputControl.setValue(data.initialValue);
        }
    }

    private setCustomError(message: string | null): void {
        if (message) {
            this.inputControl.setErrors({ ...this.inputControl.errors, customError: message });
        } else {
            if (this.inputControl.hasError('customError')) {
                const errors = { ...this.inputControl.errors };
                delete errors['customError'];
                if (Object.keys(errors).length === 0) {
                    this.inputControl.setErrors(null);
                } else {
                    this.inputControl.setErrors(errors);
                }
            }
        }
    }

    onCancel(): void {
        this.dialogRef.close();
    }

    onSubmit(): void {
        this.inputControl.markAllAsTouched();
        if (this.inputControl.invalid) {
            return;
        }

        const value = this.inputControl.value.trim();
        const validationMessage = this.data.validator ? this.data.validator(value) : null;
        this.setCustomError(validationMessage);

        if (validationMessage) {
            return;
        }

        this.dialogRef.close(value);
    }
}
