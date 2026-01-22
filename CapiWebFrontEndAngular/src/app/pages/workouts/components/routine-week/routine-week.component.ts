import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy, computed, signal, OnChanges, SimpleChanges } from '@angular/core';
import { Routine, RoutineDay } from '../../../../models/workouts';

@Component({
    selector: 'app-routine-week',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './routine-week.component.html',
    styleUrls: [],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoutineWeekComponent implements OnChanges {
    @Input() routine!: Routine;
    @Output() selectDay = new EventEmitter<RoutineDay>();

    daysOrder = [0, 1, 2, 3, 4, 5, 6];

    // Memoized day lookup - computed once per routine change instead of 7x per render
    private routineSignal = signal<Routine | null>(null);

    daysByNumber = computed(() => {
        const routine = this.routineSignal();
        if (!routine?.days) return new Map<number, RoutineDay>();

        const map = new Map<number, RoutineDay>();
        routine.days.forEach(day => map.set(day.day_of_week, day));
        return map;
    });

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['routine']) {
            this.routineSignal.set(this.routine);
        }
    }

    getDay(dayOfWeek: number): RoutineDay | undefined {
        return this.daysByNumber().get(dayOfWeek);
    }

    trackByDayNumber(index: number, dayNumber: number): number {
        return dayNumber;
    }

    handleSelect(day: RoutineDay | undefined): void {
        if (day) {
            this.selectDay.emit(day);
        }
    }
}









