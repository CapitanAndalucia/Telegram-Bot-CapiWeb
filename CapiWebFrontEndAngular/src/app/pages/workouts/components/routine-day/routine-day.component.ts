import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RoutineDay, RoutineExercise } from '../../../../models/workouts';

@Component({
    selector: 'app-routine-day',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './routine-day.component.html',
    styleUrls: ['./routine-day.component.css']
})
export class RoutineDayComponent {
    @Input() day!: RoutineDay;
    @Output() openExercise = new EventEmitter<RoutineExercise>();

    start(): void {
        // Placeholder para futuras métricas/cronómetro
    }

    handleOpen(exercise: RoutineExercise): void {
        this.openExercise.emit(exercise);
    }
}




