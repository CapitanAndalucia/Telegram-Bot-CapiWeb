import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { Routine, RoutineDay } from '../../../../models/workouts';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';

interface DayOption {
    id: number;
    short: string;
    full: string;
    selected: boolean;
    routineDayId?: number; // For Edit Mode
    routineDaySlug?: string; // For Edit Mode Navigation
}

export interface PendingRoutine {
    name: string;
    description: string;
    goal: string;
    days: PendingRoutineDay[];
}

export interface PendingRoutineDay {
    dayOfWeek: number;
    dayLabel: string;
    title: string;
    exercises: PendingExercise[];
}

export interface PendingExercise {
    id?: number;
    slug?: string;
    url_slug?: string;
    short_id?: string;
    name: string;
    sets: number;
    reps: number;
    weight: number;
    notes?: string;
    icon?: string;
}

@Component({
    selector: 'app-create-routine',
    standalone: true,
    imports: [CommonModule, FormsModule, ConfirmModalComponent],
    templateUrl: './create-routine.component.html',
    styleUrls: [],
    styles: [`:host { display: block; }`]
})
export class CreateRoutineComponent implements OnInit {
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private api = inject(ApiClientService);

    isEditMode = signal<boolean>(false);
    editingRoutineId = signal<number | null>(null);
    editingRoutine = signal<Routine | null>(null);

    routineName = signal<string>('');
    routineDescription = signal<string>('');
    routineGoal = signal<string>('');
    currentStep = signal<number>(1);
    saving = signal<boolean>(false);
    error = signal<string | null>(null);

    // Image handling
    routineImage = signal<File | null>(null);
    routineImagePreview = signal<string | null>(null);
    existingImageUrl = signal<string | null>(null);

    days = signal<DayOption[]>([
        { id: 0, short: 'Lun', full: 'Lunes', selected: false },
        { id: 1, short: 'Mar', full: 'Martes', selected: false },
        { id: 2, short: 'Mié', full: 'Miércoles', selected: false },
        { id: 3, short: 'Jue', full: 'Jueves', selected: false },
        { id: 4, short: 'Vie', full: 'Viernes', selected: false },
        { id: 5, short: 'Sáb', full: 'Sábado', selected: false },
        { id: 6, short: 'Dom', full: 'Domingo', selected: false }
    ]);

    // Modal state
    showDeleteDayModal = signal<boolean>(false);
    dayToDelete = signal<DayOption | null>(null);
    showDeleteRoutineModal = signal<boolean>(false);

    ngOnInit(): void {
        const slugParam = this.route.snapshot.paramMap.get('slug');
        if (slugParam) {
            this.isEditMode.set(true);
            this.loadRoutine(slugParam);
        }
    }

    loadRoutine(slugOrId: string | number): void {
        this.api.getRoutine(slugOrId).subscribe({
            next: (data: Routine) => {
                this.editingRoutine.set(data);
                this.editingRoutineId.set(data.id);
                this.routineName.set(data.title);
                this.routineGoal.set(data.goal || '');
                this.routineDescription.set(data.goal || ''); // Map Goal to Description for UI

                // Load existing image if any
                if (data.image_url) {
                    this.existingImageUrl.set(data.image_url);
                }

                // Map Days
                const currentDays = this.days();
                const routineDays = data.days || [];

                const updated = currentDays.map(d => {
                    // Match by day_of_week
                    // Backend might use 0-6 or 1-7. Assuming 0=Monday based on my config.
                    // Need to check backend model or assume consistent.
                    // If backend sends 'day_of_week' matching 'id' here:
                    const match = routineDays.find(rd => rd.day_of_week === d.id);
                    return {
                        ...d,
                        selected: !!match,
                        routineDayId: match?.id,
                        routineDaySlug: match?.url_slug
                    };
                });
                this.days.set(updated);
            },
            error: (err) => console.error('Error loading routine', err)
        });
    }

    toggleDay(day: DayOption): void {
        if (this.isEditMode()) {
            this.handleEditModeToggle(day);
        } else {
            const currentDays = this.days();
            const updated = currentDays.map(d =>
                d.id === day.id ? { ...d, selected: !d.selected } : d
            );
            this.days.set(updated);
        }
    }

    handleEditModeToggle(day: DayOption): void {
        const routineId = this.editingRoutineId();
        if (!routineId) return;

        if (day.selected) {
            // Deselecting -> Delete Day - show modal
            this.dayToDelete.set(day);
            this.showDeleteDayModal.set(true);
        } else {
            // Selecting -> Create Day
            const nextOrder = (this.editingRoutine()?.days?.length || 0) + 1;
            const data = {
                routine: routineId,
                day_label: day.full,
                title: 'Entrenamiento',
                day_of_week: day.id,
                order: nextOrder,
                is_completed: false
            };
            this.api.createRoutineDay(data).subscribe({
                next: () => this.loadRoutine(routineId),
                error: (err) => console.error('Error creating day', err)
            });
        }
    }

    getSelectedDays(): DayOption[] {
        return this.days().filter(d => d.selected);
    }

    canProceed(): boolean {
        return this.routineName().trim().length > 0 && this.getSelectedDays().length > 0;
    }

    goBack(): void {
        const routine = this.editingRoutine();
        if (this.isEditMode() && routine) {
            // Go back to the routine's weekly plan view
            this.router.navigate(['/workouts/routine', routine.url_slug]);
        } else {
            this.router.navigate(['/workouts']);
        }
    }

    next(): void {
        if (!this.canProceed()) return;

        if (this.isEditMode()) {
            this.saveEditChanges();
            return;
        }

        const selectedDays = this.getSelectedDays();

        // Build pending routine data
        const pendingRoutine: PendingRoutine = {
            name: this.routineName(),
            description: this.routineDescription(),
            goal: this.routineGoal() || this.routineName(),
            days: selectedDays.map(day => ({
                dayOfWeek: day.id,
                dayLabel: day.full,
                title: `Entrenamiento ${day.full}`,
                exercises: []
            }))
        };

        // Save to session storage
        sessionStorage.setItem('pendingRoutine', JSON.stringify(pendingRoutine));
        sessionStorage.setItem('currentDayIndex', '0');

        // Navigate to configure first day
        this.router.navigate(['/workouts/create/day', 0]);
    }

    saveEditChanges(): void {
        const routineId = this.editingRoutineId();
        if (routineId) {
            this.saving.set(true);
            const data = {
                title: this.routineName(),
                goal: this.routineDescription()
            };
            this.api.updateRoutine(routineId, data).subscribe({
                next: () => {
                    // If there's a new image to upload, do it after the main update
                    const imageFile = this.routineImage();
                    if (imageFile) {
                        this.api.uploadRoutineImage(routineId, imageFile).subscribe({
                            next: () => {
                                this.saving.set(false);
                                this.router.navigate(['/workouts']);
                            },
                            error: (err) => {
                                this.saving.set(false);
                                console.error('Error uploading image', err);
                                // Still navigate even if image failed
                                this.router.navigate(['/workouts']);
                            }
                        });
                    } else {
                        this.saving.set(false);
                        this.router.navigate(['/workouts']);
                    }
                },
                error: (err) => {
                    this.saving.set(false);
                    console.error('Error updating routine', err);
                }
            });
        }
    }

    deleteRoutine(): void {
        if (this.editingRoutineId()) {
            this.showDeleteRoutineModal.set(true);
        }
    }

    confirmDeleteDay(): void {
        const day = this.dayToDelete();
        const routineId = this.editingRoutineId();
        if (day?.routineDayId && routineId) {
            this.api.deleteRoutineDay(day.routineDayId).subscribe({
                next: () => {
                    this.showDeleteDayModal.set(false);
                    this.dayToDelete.set(null);
                    this.loadRoutine(routineId);
                },
                error: (err) => console.error('Error deleting day', err)
            });
        }
    }

    cancelDeleteDay(): void {
        this.showDeleteDayModal.set(false);
        this.dayToDelete.set(null);
    }

    confirmDeleteRoutine(): void {
        const routineId = this.editingRoutineId();
        if (routineId) {
            this.api.deleteRoutine(routineId).subscribe({
                next: () => this.router.navigate(['/workouts']),
                error: (err) => console.error('Error deleting routine', err)
            });
        }
    }

    cancelDeleteRoutine(): void {
        this.showDeleteRoutineModal.set(false);
    }

    editDayDetails(day: DayOption): void {
        const routine = this.editingRoutine();
        if (this.isEditMode() && day.routineDayId && routine && day.routineDaySlug) {
            this.router.navigate(['/workouts/routine', routine.url_slug, 'day', day.routineDaySlug, 'edit']);
        }
    }

    updateName(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.routineName.set(input.value);
    }

    updateDescription(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        this.routineDescription.set(textarea.value);
    }

    // Image handling
    onImageSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            this.routineImage.set(file);

            // Create preview URL
            const reader = new FileReader();
            reader.onload = (e) => {
                this.routineImagePreview.set(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    }

    removeImage(): void {
        this.routineImage.set(null);
        this.routineImagePreview.set(null);
        this.existingImageUrl.set(null);
    }

    getCurrentImageUrl(): string | null {
        return this.routineImagePreview() || this.existingImageUrl();
    }

    triggerImageUpload(): void {
        const input = document.getElementById('routine-image-input') as HTMLInputElement;
        input?.click();
    }
}
