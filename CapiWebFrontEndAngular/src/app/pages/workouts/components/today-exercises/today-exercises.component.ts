import { Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { Routine, RoutineDay, RoutineExercise } from '../../../../models/workouts';

interface ExerciseWithState extends RoutineExercise {
    isCompleted: boolean;
    isActive: boolean;
}

@Component({
    selector: 'app-today-exercises',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './today-exercises.component.html',
    styleUrls: [],
    styles: [`:host { display: block; }`]
})
export class TodayExercisesComponent implements OnInit, OnDestroy {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    routineId = signal<number | null>(null);
    dayId = signal<number | null>(null);
    dayTitle = signal<string>('Workout');
    exercises = signal<ExerciseWithState[]>([]);
    loading = signal<boolean>(true);
    error = signal<string | null>(null);

    // Timer
    hours = signal<number>(0);
    minutes = signal<number>(0);
    seconds = signal<number>(0);
    private timerInterval: any;
    private startTime: number = 0;

    // Progress
    completedCount = signal<number>(0);
    totalCount = signal<number>(0);
    progressPercent = signal<number>(0);

    ngOnInit(): void {
        const routineIdParam = this.route.snapshot.paramMap.get('routineId');
        const dayIdParam = this.route.snapshot.paramMap.get('dayId');

        if (routineIdParam) this.routineId.set(parseInt(routineIdParam));
        if (dayIdParam) this.dayId.set(parseInt(dayIdParam));

        this.loadExercises();
        this.startTimer();
    }

    ngOnDestroy(): void {
        this.stopTimer();
    }

    loadExercises(): void {
        this.loading.set(true);
        this.error.set(null);

        const rId = this.routineId();
        if (!rId) {
            this.error.set('Routine ID not found');
            this.loading.set(false);
            return;
        }

        this.api.getRoutine(rId).subscribe({
            next: (routine: Routine) => {
                const dId = this.dayId();
                const day = routine.days?.find(d => d.id === dId);

                if (day) {
                    this.dayTitle.set(day.title || day.day_label || 'Workout');
                    const exercisesWithState: ExerciseWithState[] = (day.routine_exercises || []).map((ex, idx) => ({
                        ...ex,
                        isCompleted: false,
                        isActive: idx === 0
                    }));
                    this.exercises.set(exercisesWithState);
                    this.updateProgress();
                }
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading exercises:', err);
                this.error.set('Error al cargar los ejercicios');
                this.loading.set(false);
            }
        });
    }

    startTimer(): void {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const totalSeconds = Math.floor(elapsed / 1000);
            this.hours.set(Math.floor(totalSeconds / 3600));
            this.minutes.set(Math.floor((totalSeconds % 3600) / 60));
            this.seconds.set(totalSeconds % 60);
        }, 1000);
    }

    stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }

    updateProgress(): void {
        const exercises = this.exercises();
        const completed = exercises.filter(e => e.isCompleted).length;
        const total = exercises.length;
        this.completedCount.set(completed);
        this.totalCount.set(total);
        this.progressPercent.set(total > 0 ? Math.round((completed / total) * 100) : 0);
    }

    toggleExercise(exercise: ExerciseWithState): void {
        const exercises = this.exercises();
        const index = exercises.findIndex(e => e.id === exercise.id);
        if (index >= 0) {
            const updated = [...exercises];
            updated[index] = { ...updated[index], isCompleted: !updated[index].isCompleted };

            // Update active status - first incomplete exercise becomes active
            let foundActive = false;
            for (let i = 0; i < updated.length; i++) {
                if (!updated[i].isCompleted && !foundActive) {
                    updated[i] = { ...updated[i], isActive: true };
                    foundActive = true;
                } else {
                    updated[i] = { ...updated[i], isActive: false };
                }
            }

            this.exercises.set(updated);
            this.updateProgress();
        }
    }

    getExerciseIcon(exercise: ExerciseWithState): string {
        const name = exercise.exercise_detail?.name?.toLowerCase() || '';
        if (name.includes('cardio') || name.includes('run')) return 'monitor_heart';
        if (name.includes('press') || name.includes('raise')) return 'directions_run';
        if (name.includes('pushdown') || name.includes('dips')) return 'accessibility_new';
        return 'fitness_center';
    }

    formatWeight(weight: number): string {
        return weight > 0 ? `${weight}kg` : '';
    }

    formatExerciseInfo(exercise: ExerciseWithState): string {
        if (exercise.note) return exercise.note;
        const parts = [];
        parts.push(`${exercise.target_sets} sets`);
        parts.push(`${exercise.target_reps} reps`);
        if (exercise.target_weight > 0) {
            parts.push(`${exercise.target_weight}kg`);
        }
        return parts.join(' • ');
    }

    goBack(): void {
        const rId = this.routineId();
        if (rId) {
            this.router.navigate(['/workouts/routine', rId]);
        } else {
            this.router.navigate(['/workouts']);
        }
    }

    openExerciseDetail(exercise: ExerciseWithState): void {
        this.router.navigate(['/workouts/exercise', exercise.id]);
    }

    finishWorkout(): void {
        this.stopTimer();
        // Could show completion modal or navigate to summary
        this.router.navigate(['/workouts']);
    }

    padZero(num: number): string {
        return num.toString().padStart(2, '0');
    }
}
