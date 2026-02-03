import { Injectable, computed, signal, inject } from '@angular/core';
import { Routine, RoutineExercise } from '../models/workouts';
import { Router } from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class WorkoutSessionService {
    private router = inject(Router);

    // State Signals
    isActive = signal<boolean>(false);
    isPaused = signal<boolean>(false);

    // Session Data
    completedExerciseIds = signal<Set<number>>(new Set());

    // Timer Signals
    startTime = signal<number>(0);
    elapsedSeconds = signal<number>(0); // Total elapsed seconds excluding pauses

    // Workout Context
    activeRoutineSlug = signal<string | null>(null);
    activeDaySlug = signal<string | null>(null);
    activeDayTitle = signal<string>('');

    // Current Exercise Context (for Mini Player)
    currentExercise = signal<RoutineExercise | null>(null);

    // Progress
    completedExercisesCount = signal<number>(0);
    totalExercisesCount = signal<number>(0);

    // Private timer handle
    private timerInterval: any = null;
    private lastTickTime: number = 0;

    // Computed display values
    hours = computed(() => Math.floor(this.elapsedSeconds() / 3600));
    minutes = computed(() => Math.floor((this.elapsedSeconds() % 3600) / 60));
    seconds = computed(() => this.elapsedSeconds() % 60);

    constructor() {
        // Attempt to restore session from storage if needed (future enhancement)
    }

    startWorkout(routineSlug: string, daySlug: string, dayTitle: string): void {
        if (this.isActive() && this.activeRoutineSlug() === routineSlug && this.activeDaySlug() === daySlug) {
            // Already active for this workout, just resume if paused
            if (this.isPaused()) {
                this.resumeWorkout();
            }
            return;
        }

        // New Workout
        this.stopWorkout(); // Ensure clean state

        this.isActive.set(true);
        this.isPaused.set(false);
        this.activeRoutineSlug.set(routineSlug);
        this.activeDaySlug.set(daySlug);
        this.activeDayTitle.set(dayTitle);

        this.startTime.set(Date.now());
        this.elapsedSeconds.set(0);
        this.lastTickTime = Date.now();

        this.startTimer();
    }

    stopWorkout(): void {
        this.stopTimer();
        this.isActive.set(false);
        this.isPaused.set(false);
        this.activeRoutineSlug.set(null);
        this.activeDaySlug.set(null);
        this.currentExercise.set(null);
        this.elapsedSeconds.set(0);
    }

    pauseWorkout(): void {
        if (!this.isActive() || this.isPaused()) return;

        this.stopTimer();
        this.isPaused.set(true);
    }

    resumeWorkout(): void {
        if (!this.isActive() || !this.isPaused()) return;

        this.isPaused.set(false);
        this.lastTickTime = Date.now(); // Reset tick base
        this.startTimer();
    }

    togglePause(): void {
        if (this.isPaused()) {
            this.resumeWorkout();
        } else {
            this.pauseWorkout();
        }
    }

    updateProgress(completed: number, total: number): void {
        this.completedExercisesCount.set(completed);
        this.totalExercisesCount.set(total);
    }

    setCurrentExercise(exercise: RoutineExercise | null): void {
        this.currentExercise.set(exercise);
    }

    toggleExerciseCompletion(exerciseId: number, isCompleted: boolean): void {
        this.completedExerciseIds.update(set => {
            const newSet = new Set(set);
            if (isCompleted) {
                newSet.add(exerciseId);
            } else {
                newSet.delete(exerciseId);
            }
            return newSet;
        });
    }

    isExerciseCompleted(exerciseId: number): boolean {
        return this.completedExerciseIds().has(exerciseId);
    }

    private startTimer(): void {
        if (this.timerInterval) clearInterval(this.timerInterval);

        this.timerInterval = setInterval(() => {
            const now = Date.now();
            // Calculate delta to avoid drift, but simple accumulation is fine for this
            // We rely on simple second increments for UI
            // Ideally we would compare against startTime - totalPausedTime

            this.elapsedSeconds.update(v => v + 1);
            this.lastTickTime = now;
        }, 1000);
    }

    private stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    // Navigation Helper
    navigateToActiveWorkout(): void {
        if (this.isActive() && this.activeRoutineSlug() && this.activeDaySlug()) {
            this.router.navigate(['/workouts/workout', this.activeRoutineSlug(), this.activeDaySlug()]);
        }
    }
}
