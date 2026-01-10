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
        }
        :host ::ng-deep .mat-mdc-dialog-surface {
            background: #1e1e1e; /* gd-bg */
            border-radius: 8px; /* Google Drive uses typically less rounded, but 8px-12px is fine */
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.2);
            border: none;
        }
        .dialog-root {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            color: #e3e3e3; /* gd-text */
            padding: 0.5rem;
        }
        h2[mat-dialog-title] {
            margin: 0;
            font-size: 1.375rem;
            font-weight: 400; /* Google Sans typically 400 for titles */
            color: #e3e3e3;
            font-family: "Google Sans", Roboto, Arial, sans-serif;
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
            --mdc-filled-text-field-container-color: transparent;
            --mdc-outlined-text-field-outline-color: #8e918f; /* gd-text-secondary-ish */
            --mdc-outlined-text-field-focus-outline-color: #8ab4f8; /* gd-blue */
            --mdc-outlined-text-field-hover-outline-color: #e3e3e3;
            --mdc-outlined-text-field-label-text-color: #c4c7c5;
            --mdc-outlined-text-field-focus-label-text-color: #8ab4f8;
            --mdc-outlined-text-field-input-text-color: #e3e3e3;
            --mdc-outlined-text-field-caret-color: #8ab4f8;
        }
        :host ::ng-deep .mat-mdc-form-field-infix {
            padding-left: 12px !important;
        }
        :host ::ng-deep .mat-mdc-form-field-flex {
            border-radius: 4px; /* Standard Material/Google radius */
        }
        :host ::ng-deep .mdc-text-field--outlined .mdc-notched-outline .mdc-notched-outline__leading,
        :host ::ng-deep .mdc-text-field--outlined .mdc-notched-outline .mdc-notched-outline__notch,
        :host ::ng-deep .mdc-text-field--outlined .mdc-notched-outline .mdc-notched-outline__trailing {
            border-color: #8e918f !important;
        }
        :host ::ng-deep .mdc-text-field--outlined:not(.mdc-text-field--disabled).mdc-text-field--focused .mdc-notched-outline__leading,
        :host ::ng-deep .mdc-text-field--outlined:not(.mdc-text-field--disabled).mdc-text-field--focused .mdc-notched-outline__notch,
        :host ::ng-deep .mdc-text-field--outlined:not(.mdc-text-field--disabled).mdc-text-field--focused .mdc-notched-outline__trailing {
            border-color: #8ab4f8 !important;
            border-width: 2px;
        }
        :host ::ng-deep .mat-mdc-form-field-focus-overlay {
            background: transparent;
        }
        :host ::ng-deep .mat-mdc-form-field-subscript-wrapper {
            margin-top: 0.4rem;
        }
        :host ::ng-deep .mat-mdc-input-element {
            color: #e3e3e3 !important;
        }
        :host ::ng-deep .mat-mdc-form-field-label,
        :host ::ng-deep .mdc-floating-label {
            color: #c4c7c5 !important;
        }
        :host ::ng-deep .mat-mdc-form-field.mat-focused .mdc-floating-label {
            color: #8ab4f8 !important;
        }
        .dialog-actions {
            display: flex;
            gap: 0.75rem;
            justify-content: flex-end;
            padding-top: 0.5rem;
        }
        button[mat-button] {
            text-transform: none;
            color: #8ab4f8; /* Secondary button blue */
            border-radius: 20px; /* Google pill shape */
            padding: 0 24px;
            height: 40px;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        button[mat-button]:hover {
            background: rgba(138, 180, 248, 0.08);
            color: #8ab4f8;
        }
        .action-button {
            text-transform: none;
            font-weight: 500;
            padding: 0 24px;
            border-radius: 20px;
            background: #8ab4f8 !important; /* Primary Blue */
            color: #062e6f !important; /* Dark Blue Text */
            border: none;
            transition: box-shadow 0.2s ease, background 0.2s ease;
        }
        .action-button:hover:not(:disabled) {
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            background: #a8c7fa !important; /* Slightly lighter on hover */
        }
        .action-button:disabled {
            background: rgba(227, 227, 227, 0.12) !important;
            color: rgba(227, 227, 227, 0.38) !important;
            cursor: not-allowed;
        }

        @media (max-width: 768px) {
            .mobile-dialog .mat-mdc-dialog-container {
                max-width: 90vw !important;
                width: 90vw !important;
                margin: 0 auto;
            }
            .mobile-dialog .mat-mdc-dialog-surface {
                border-radius: 12px;
                padding: 1rem;
            }
            .mobile-dialog .mat-mdc-dialog-title {
                font-size: 1.1rem !important;
                padding: 0.5rem 0 !important;
                margin: 0 !important;
            }
            .mobile-dialog .mat-mdc-dialog-content {
                padding: 1rem 0 !important;
                margin: 0 !important;
                max-height: 60vh !important;
            }
            .mobile-dialog .mat-mdc-form-field {
                width: 100% !important;
            }
            .mobile-dialog .mat-mdc-input-element {
                font-size: 1rem !important;
                padding: 0.5rem !important;
            }
            .mobile-dialog .mat-mdc-dialog-actions {
                padding: 1rem 0 0 0 !important;
                margin: 0 !important;
                gap: 0.5rem !important;
            }
            .mobile-dialog .mat-mdc-button {
                flex: 1 !important;
                min-height: 44px !important;
                font-size: 1rem !important;
            }
            /* Specific styles for rename dialog */
            .mobile-dialog.rename-dialog-panel .mat-mdc-form-field {
                margin-bottom: 0.5rem;
            }
            .mobile-dialog.rename-dialog-panel .mat-mdc-form-field-appearance-outline .mat-mdc-form-field-flex {
                padding: 0.5rem 0.75rem !important;
            }
            .mobile-dialog.rename-dialog-panel .mat-mdc-form-field-infix {
                padding: 0.25rem 0 !important;
            }
            /* Loading spinner positioning in mobile */
            .mobile-dialog .mat-spinner {
                position: absolute !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
            }
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
