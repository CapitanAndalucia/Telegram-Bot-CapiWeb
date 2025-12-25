import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Routine, RoutineDay } from '../../../../models/workouts';

@Component({
    selector: 'app-routine-week',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './routine-week.component.html',
    styleUrls: ['./routine-week.component.css']
})
export class RoutineWeekComponent {
    @Input() routine!: Routine;
    @Output() selectDay = new EventEmitter<RoutineDay>();

    daysOrder = [0, 1, 2, 3, 4, 5, 6];

    findDay(dayOfWeek: number): RoutineDay | undefined {
        return this.routine?.days?.find(d => d.day_of_week === dayOfWeek);
    }

    handleSelect(day: RoutineDay | undefined): void {
        if (day) {
            this.selectDay.emit(day);
        }
    }
}




