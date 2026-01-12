import { Component, OnInit, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { PendingRoutine, PendingRoutineDay, PendingExercise } from '../create-routine/create-routine.component';

@Component({
    selector: 'app-configure-day',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './configure-day.component.html',
    styleUrls: ['./configure-day.component.css']
})
export class ConfigureDayComponent implements OnInit {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    @ViewChild('dayImageInput') dayImageInput!: ElementRef<HTMLInputElement>;

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
        // Subscribe to route param changes to update when navigating between days
        this.route.paramMap.subscribe(params => {
            const indexParam = params.get('dayIndex');
            const index = indexParam ? parseInt(indexParam) : 0;
            this.dayIndex.set(index);
            this.loadPendingRoutine();
        });
    }

    loadPendingRoutine(): void {
        const stored = sessionStorage.getItem('pendingRoutine');
        if (!stored) {
            // No pending routine, redirect to create
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
        }
    }

    updateFocus(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.sessionFocus.set(input.value);
    }

    addExercise(): void {
        // Save current state before navigating
        this.saveCurrentState();
        this.router.navigate(['/workouts/create/day', this.dayIndex(), 'add-exercise']);
    }

    removeExercise(exercise: PendingExercise): void {
        const current = this.exercises();
        const updated = current.filter(e => e.name !== exercise.name);
        this.exercises.set(updated);
    }

    saveCurrentState(): void {
        const routine = this.pendingRoutine();
        if (!routine) return;

        const dayIdx = this.dayIndex();
        routine.days[dayIdx].title = this.sessionFocus();
        routine.days[dayIdx].exercises = this.exercises();

        sessionStorage.setItem('pendingRoutine', JSON.stringify(routine));
    }

    saveDay(): void {
        this.saveCurrentState();

        const routine = this.pendingRoutine();
        if (!routine) return;

        const dayIdx = this.dayIndex();
        const totalDays = routine.days.length;

        if (dayIdx < totalDays - 1) {
            // Go to next day
            this.router.navigate(['/workouts/create/day', dayIdx + 1]);
        } else {
            // Last day - save routine to backend
            this.finishRoutine();
        }
    }

    finishRoutine(): void {
        const routine = this.pendingRoutine();
        if (!routine) return;

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
        const dayIdx = this.dayIndex();
        if (dayIdx > 0) {
            this.saveCurrentState();
            this.router.navigate(['/workouts/create/day', dayIdx - 1]);
        } else {
            this.router.navigate(['/workouts/create']);
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
