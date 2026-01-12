import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface DayOption {
    id: number;
    short: string;
    full: string;
    selected: boolean;
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
    name: string;
    sets: number;
    reps: number;
    weight: number;
    notes?: string;
}

@Component({
    selector: 'app-create-routine',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './create-routine.component.html',
    styleUrls: ['./create-routine.component.css']
})
export class CreateRoutineComponent {
    private router = inject(Router);

    routineName = signal<string>('');
    routineDescription = signal<string>('');
    routineGoal = signal<string>('');
    currentStep = signal<number>(1);
    saving = signal<boolean>(false);
    error = signal<string | null>(null);

    days = signal<DayOption[]>([
        { id: 0, short: 'Lun', full: 'Lunes', selected: false },
        { id: 1, short: 'Mar', full: 'Martes', selected: false },
        { id: 2, short: 'Mié', full: 'Miércoles', selected: false },
        { id: 3, short: 'Jue', full: 'Jueves', selected: false },
        { id: 4, short: 'Vie', full: 'Viernes', selected: false },
        { id: 5, short: 'Sáb', full: 'Sábado', selected: false },
        { id: 6, short: 'Dom', full: 'Domingo', selected: false }
    ]);

    toggleDay(day: DayOption): void {
        const currentDays = this.days();
        const updated = currentDays.map(d =>
            d.id === day.id ? { ...d, selected: !d.selected } : d
        );
        this.days.set(updated);
    }

    getSelectedDays(): DayOption[] {
        return this.days().filter(d => d.selected);
    }

    canProceed(): boolean {
        return this.routineName().trim().length > 0 && this.getSelectedDays().length > 0;
    }

    goBack(): void {
        this.router.navigate(['/workouts']);
    }

    next(): void {
        if (!this.canProceed()) return;

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

    updateName(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.routineName.set(input.value);
    }

    updateDescription(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        this.routineDescription.set(textarea.value);
    }
}
