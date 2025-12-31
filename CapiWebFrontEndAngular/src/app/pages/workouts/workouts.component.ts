import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../services/api-client.service';
import { Routine, RoutineDay, RoutineExercise, ExerciseProgressPoint } from '../../models/workouts';
import { RoutineWeekComponent } from './components/routine-week/routine-week.component';
import { RoutineDayComponent } from './components/routine-day/routine-day.component';
import { ExerciseModalComponent } from './components/exercise-modal/exercise-modal.component';

@Component({
    selector: 'app-workouts',
    standalone: true,
    imports: [CommonModule, FormsModule, RoutineWeekComponent, RoutineDayComponent, ExerciseModalComponent],
    templateUrl: './workouts.component.html',
    styleUrls: ['./workouts.component.css']
})
export class WorkoutsComponent implements OnInit {
    private api = inject(ApiClientService);

    routines = signal<Routine[]>([]);
    selectedRoutine = signal<Routine | null>(null);
    selectedDay = signal<RoutineDay | null>(null);
    selectedExercise = signal<RoutineExercise | null>(null);
    exerciseProgress = signal<ExerciseProgressPoint[]>([]);
    loading = signal<boolean>(false);
    loadingExercise = signal<boolean>(false);
    error = signal<string | null>(null);

    ngOnInit(): void {
        // this.loadRoutines();
    }

    loadRoutines(): void {
        this.loading.set(true);
        this.api.listRoutines().subscribe({
            next: (data) => {
                this.routines.set(data);
                if (data.length > 0) {
                    this.selectRoutine(data[0]);
                }
                this.loading.set(false);
            },
            error: (err) => {
                this.error.set(err.message || 'No se pudieron cargar las rutinas');
                this.loading.set(false);
            }
        });
    }

    selectRoutine(routine: Routine): void {
        this.selectedRoutine.set(routine);
        const firstDay = routine.days?.[0] ?? null;
        this.selectedDay.set(firstDay);
        this.selectedExercise.set(null);
    }

    handleDaySelected(day: RoutineDay): void {
        this.selectedDay.set(day);
        this.selectedExercise.set(null);
    }

    openExercise(exercise: RoutineExercise): void {
        this.loadingExercise.set(true);
        this.api.getRoutineExercise(exercise.id).subscribe({
            next: (detail) => {
                this.selectedExercise.set(detail);
                this.loadingExercise.set(false);
            },
            error: (err) => {
                this.error.set(err.message || 'No se pudo cargar el ejercicio');
                this.loadingExercise.set(false);
            }
        });
        this.api.getRoutineExerciseProgress(exercise.id).subscribe({
            next: (progress) => this.exerciseProgress.set(progress),
            error: () => this.exerciseProgress.set([])
        });
    }

    handleCloseModal(): void {
        this.selectedExercise.set(null);
    }

    handleSetCreated(_: any): void {
        const exercise = this.selectedExercise();
        if (!exercise) return;
        this.openExercise(exercise);
    }
}

