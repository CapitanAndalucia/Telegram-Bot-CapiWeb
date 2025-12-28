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
            min-width: 340px;
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
        .dialog-form {
            margin: 0;
            display: block;
        }
        .full-width {
            width: 100%;
        }
        /* Material form field dark theme overrides */
        :host ::ng-deep .mat-mdc-form-field {
            --mdc-filled-text-field-container-color: rgba(255, 255, 255, 0.05);
            --mdc-outlined-text-field-outline-color: rgba(255, 255, 255, 0.2);
            --mdc-outlined-text-field-focus-outline-color: #00f2ff;
            --mdc-outlined-text-field-hover-outline-color: rgba(0, 242, 255, 0.5);
            --mdc-outlined-text-field-label-text-color: rgba(255, 255, 255, 0.6);
            --mdc-outlined-text-field-focus-label-text-color: #00f2ff;
            --mdc-outlined-text-field-input-text-color: #fff;
            --mdc-outlined-text-field-caret-color: #00f2ff;
        }
        :host ::ng-deep .mat-mdc-form-field-flex {
            border-radius: 10px;
        }
        :host ::ng-deep .mdc-text-field--outlined .mdc-notched-outline .mdc-notched-outline__leading,
        :host ::ng-deep .mdc-text-field--outlined .mdc-notched-outline .mdc-notched-outline__notch,
        :host ::ng-deep .mdc-text-field--outlined .mdc-notched-outline .mdc-notched-outline__trailing {
            border-color: rgba(255, 255, 255, 0.2) !important;
        }
        :host ::ng-deep .mdc-text-field--outlined:not(.mdc-text-field--disabled).mdc-text-field--focused .mdc-notched-outline__leading,
        :host ::ng-deep .mdc-text-field--outlined:not(.mdc-text-field--disabled).mdc-text-field--focused .mdc-notched-outline__notch,
        :host ::ng-deep .mdc-text-field--outlined:not(.mdc-text-field--disabled).mdc-text-field--focused .mdc-notched-outline__trailing {
            border-color: #00f2ff !important;
        }
        :host ::ng-deep .mat-mdc-form-field-focus-overlay {
            background: rgba(0, 242, 255, 0.05);
        }
        :host ::ng-deep .mat-mdc-form-field-subscript-wrapper {
            margin-top: 0.4rem;
        }
        :host ::ng-deep .mat-mdc-input-element {
            color: #fff !important;
        }
        :host ::ng-deep .mat-mdc-form-field-label,
        :host ::ng-deep .mdc-floating-label {
            color: rgba(255, 255, 255, 0.6) !important;
        }
        :host ::ng-deep .mat-mdc-form-field.mat-focused .mdc-floating-label {
            color: #00f2ff !important;
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
        .action-button:hover:not(:disabled) {
            background: linear-gradient(135deg, rgba(0, 242, 255, 0.3), rgba(139, 92, 246, 0.25));
            box-shadow: 0 4px 15px rgba(0, 242, 255, 0.2);
        }
        .action-button:disabled {
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.3);
            border-color: rgba(255, 255, 255, 0.1);
            cursor: not-allowed;
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
