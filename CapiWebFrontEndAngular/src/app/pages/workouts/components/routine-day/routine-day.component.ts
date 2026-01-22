import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { RoutineDay, RoutineExercise } from '../../../../models/workouts';

@Component({
    selector: 'app-routine-day',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './routine-day.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoutineDayComponent {
    @Input() day!: RoutineDay;
    @Output() openExercise = new EventEmitter<RoutineExercise>();

    start(): void {
        // Placeholder para futuras métricas/cronómetro
    }

    trackByExercise(index: number, exercise: RoutineExercise): number | string {
        return exercise.id || index;
    }

    handleOpen(exercise: RoutineExercise): void {
        this.openExercise.emit(exercise);
    }
}









