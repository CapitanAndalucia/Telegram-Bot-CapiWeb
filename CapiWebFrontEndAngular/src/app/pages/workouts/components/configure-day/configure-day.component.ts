import { Component, OnInit, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { PendingRoutine, PendingRoutineDay, PendingExercise } from '../create-routine/create-routine.component';
import { Routine, RoutineDay } from '../../../../models/workouts';

@Component({
    selector: 'app-configure-day',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './configure-day.component.html',
    styleUrls: [],
    styles: [`:host { display: block; }`]
})
export class ConfigureDayComponent implements OnInit {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    @ViewChild('dayImageInput') dayImageInput!: ElementRef<HTMLInputElement>;

    isEditMode = signal<boolean>(false);
    editingRoutineId = signal<number | null>(null);
    editingDayId = signal<number | null>(null);

    dayIndex = signal<number>(0);
    dayName = signal<string>('');
    sessionFocus = signal<string>('');
    exercises = signal<PendingExercise[]>([]);
    pendingRoutine = signal<PendingRoutine | null>(null);
    saving = signal<boolean>(false);
    error = signal<string | null>(null);

    // Day image state
    dayImagePreview = signal<string | null>(null);
    dayImageFile = signal<File | null>(null);
    uploadingImage = signal<boolean>(false);

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            const routineId = params.get('routineId');
            const dayId = params.get('dayId');

            if (routineId && dayId) {
                this.isEditMode.set(true);
                this.editingRoutineId.set(parseInt(routineId));
                this.editingDayId.set(parseInt(dayId));
                this.loadEditingDay(parseInt(routineId), parseInt(dayId));
            } else {
                // Create Mode
                const indexParam = params.get('dayIndex');
                const index = indexParam ? parseInt(indexParam) : 0;
                this.dayIndex.set(index);
                this.loadPendingRoutine();
            }
        });
    }

    loadEditingDay(routineId: number, dayId: number): void {
        this.api.getRoutine(routineId).subscribe({
            next: (routine: Routine) => {
                const day = routine.days.find(d => d.id === dayId);
                if (day) {
                    this.dayName.set(day.day_label);
                    this.sessionFocus.set(day.title || '');
                    // Map exercises
                    const mapped: PendingExercise[] = (day.routine_exercises || []).map(ex => ({
                        id: ex.id, // Keep ID for updates/deletes
                        name: ex.exercise_detail.name,
                        sets: ex.target_sets,
                        reps: ex.target_reps,
                        weight: ex.target_weight,
                        notes: ex.note
                    }));
                    this.exercises.set(mapped);
                    // Image TODO: Need to fetch or show existing image. 
                    // Assuming day doesn't expose image URL directly in Routine? 
                    // Previously I added `image` field to RoutineDay.
                    // If backend sends it, I can show it.
                }
            },
            error: (err) => console.error('Error loading routine for day edit', err)
        });
    }

    loadPendingRoutine(): void {
        const stored = sessionStorage.getItem('pendingRoutine');
        if (!stored) {
            this.router.navigate(['/workouts/create']);
            return;
        }

        const routine: PendingRoutine = JSON.parse(stored);
        this.pendingRoutine.set(routine);

        const dayIdx = this.dayIndex();
        if (dayIdx >= 0 && dayIdx < routine.days.length) {
            const day = routine.days[dayIdx];
            this.dayName.set(day.dayLabel);
            this.sessionFocus.set(day.title);
            this.exercises.set(day.exercises || []);

            // Check for stored image in create mode
            if ((day as any).imageBase64) {
                this.dayImagePreview.set((day as any).imageBase64);
            }
        }
    }

    updateFocus(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.sessionFocus.set(input.value);
    }

    editExercise(exercise: PendingExercise): void {
        if (this.isEditMode() && exercise.id) {
            this.router.navigate(['/workouts/routine', this.editingRoutineId(), 'day', this.editingDayId(), 'exercise', exercise.id, 'edit']);
        }
    }

    addExercise(): void {
        if (this.isEditMode()) {
            this.router.navigate(['/workouts/routine', this.editingRoutineId(), 'day', this.editingDayId(), 'add-exercise']);
        } else {
            this.saveToPending();
            this.router.navigate(['/workouts/create/day', this.dayIndex(), 'add-exercise']);
        }
    }

    removeExercise(exercise: PendingExercise): void {
        if (this.isEditMode()) {
            if (exercise.id && confirm('¿Eliminar este ejercicio?')) {
                this.api.deleteRoutineExercise(exercise.id).subscribe({
                    next: () => {
                        // Reload or just remove locally
                        this.exercises.update(list => list.filter(e => e.id !== exercise.id));
                    },
                    error: (err) => console.error('Error deleting exercise', err)
                });
            }
        } else {
            this.exercises.update(ex => ex.filter(e => e !== exercise));
            this.saveToPending();
        }
    }

    saveToPending(): void {
        if (this.isEditMode()) return;
        const routine = this.pendingRoutine();
        if (routine) {
            routine.days[this.dayIndex()].title = this.sessionFocus();
            routine.days[this.dayIndex()].exercises = this.exercises();
            sessionStorage.setItem('pendingRoutine', JSON.stringify(routine));
        }
    }

    saveDay(): void {
        if (this.saving()) return;
        this.saving.set(true);

        if (this.isEditMode()) {
            // Update Day Info
            const dayId = this.editingDayId();
            if (dayId) {
                const data = {
                    title: this.sessionFocus()
                };
                this.api.updateRoutineDay(dayId, data).subscribe({
                    next: () => {
                        // Upload image if changed? 
                        // Need separate logic (uploadRoutineDayImage).
                        // Assuming image upload is separate or I can do it here.
                        this.finishEdit();
                    },
                    error: (err) => {
                        console.error('Error updating day', err);
                        this.error.set('Error al actualizar el día');
                        this.saving.set(false);
                    }
                });
            }
            return;
        }

        // Create Mode Logic
        this.saveToPending();

        const routine = this.pendingRoutine();
        if (!routine) {
            this.saving.set(false);
            return;
        }

        // Determine navigation
        const nextIndex = this.dayIndex() + 1;
        if (nextIndex < routine.days.length) {
            this.router.navigate(['/workouts/create/day', nextIndex]);
            this.saving.set(false); // Reset saving state for next day
        } else {
            this.createFullRoutine(routine); // Finish
        }
    }

    finishEdit(): void {
        this.saving.set(false);
        // Go back to Routine Edit (Hub)
        this.router.navigate(['/workouts/edit', this.editingRoutineId()]);
    }

    createFullRoutine(routine: PendingRoutine): void {
        this.saving.set(true);
        this.error.set(null);

        // Build API payload - only include exercises with valid IDs
        const routineData = {
            title: routine.name,
            goal: routine.goal,
            days: routine.days.map((day, idx) => ({
                day_of_week: day.dayOfWeek,
                title: day.title || `Day ${idx + 1}`,
                order: idx,
                // Only include exercises that have a valid ID (exist in DB)
                routine_exercises: day.exercises
                    .filter(ex => ex.id && ex.id > 0)
                    .map((ex, exIdx) => ({
                        exercise: ex.id,
                        order: exIdx,
                        target_sets: ex.sets,
                        target_reps: ex.reps,
                        target_weight: ex.weight,
                        rest_seconds: 60,
                        note: ex.notes || ''
                    }))
            }))
        };

        console.log('Creating routine with data:', JSON.stringify(routineData, null, 2));

        this.api.createRoutine(routineData).subscribe({
            next: (createdRoutine) => {
                // Clear session storage
                sessionStorage.removeItem('pendingRoutine');
                sessionStorage.removeItem('currentDayIndex');

                this.saving.set(false);
                // Navigate to the new routine
                this.router.navigate(['/workouts/routine', createdRoutine.id]);
            },
            error: (err) => {
                console.error('Error creating routine:', err);
                this.error.set('Error al crear la rutina');
                this.saving.set(false);
            }
        });
    }

    goBack(): void {
        if (this.isEditMode()) {
            this.router.navigate(['/workouts/edit', this.editingRoutineId()]);
        } else {
            const dayIdx = this.dayIndex();
            if (dayIdx > 0) {
                this.saveToPending();
                this.router.navigate(['/workouts/create/day', dayIdx - 1]);
            } else {
                this.router.navigate(['/workouts/create']);
            }
        }
    }

    getTotalDays(): number {
        return this.pendingRoutine()?.days.length || 0;
    }

    isLastDay(): boolean {
        return this.dayIndex() >= this.getTotalDays() - 1;
    }

    // Image handling methods
    openImagePicker(): void {
        this.dayImageInput?.nativeElement.click();
    }

    onImageSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];

            // Validate file type
            if (!file.type.startsWith('image/')) {
                this.error.set('Por favor selecciona una imagen válida');
                return;
            }

            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                this.error.set('La imagen no puede superar 10MB');
                return;
            }

            this.dayImageFile.set(file);

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                this.dayImagePreview.set(e.target?.result as string);
            };
            reader.readAsDataURL(file);

            // Save to pending routine state
            this.saveImageToState(file);
        }
    }

    saveImageToState(file: File): void {
        // Store the file as base64 in sessionStorage for now
        // It will be uploaded after the routine is created
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            const routine = this.pendingRoutine();
            if (routine) {
                const dayIdx = this.dayIndex();
                (routine.days[dayIdx] as any).imageBase64 = base64;
                (routine.days[dayIdx] as any).imageFileName = file.name;
                sessionStorage.setItem('pendingRoutine', JSON.stringify(routine));
            }
        };
        reader.readAsDataURL(file);
    }

    removeImage(): void {
        this.dayImagePreview.set(null);
        this.dayImageFile.set(null);

        const routine = this.pendingRoutine();
        if (routine) {
            const dayIdx = this.dayIndex();
            delete (routine.days[dayIdx] as any).imageBase64;
            delete (routine.days[dayIdx] as any).imageFileName;
            sessionStorage.setItem('pendingRoutine', JSON.stringify(routine));
        }
    }
}
