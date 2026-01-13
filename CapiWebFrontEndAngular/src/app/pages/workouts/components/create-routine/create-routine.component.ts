import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { Routine, RoutineDay } from '../../../../models/workouts';

interface DayOption {
    id: number;
    short: string;
    full: string;
    selected: boolean;
    routineDayId?: number; // For Edit Mode
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
    styleUrls: [],
    styles: [`:host { display: block; }`]
})
export class CreateRoutineComponent implements OnInit {
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private api = inject(ApiClientService);

    isEditMode = signal<boolean>(false);
    editingRoutineId = signal<number | null>(null);
    editingRoutine = signal<Routine | null>(null);

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

    ngOnInit(): void {
        const idParam = this.route.snapshot.paramMap.get('id');
        if (idParam) {
            this.isEditMode.set(true);
            this.editingRoutineId.set(parseInt(idParam));
            this.loadRoutine(parseInt(idParam));
        }
    }

    loadRoutine(id: number): void {
        this.api.getRoutine(id).subscribe({
            next: (data: Routine) => {
                this.editingRoutine.set(data);
                this.routineName.set(data.title);
                this.routineGoal.set(data.goal || '');
                this.routineDescription.set(data.goal || ''); // Map Goal to Description for UI

                // Map Days
                const currentDays = this.days();
                const routineDays = data.days || [];

                const updated = currentDays.map(d => {
                    // Match by day_of_week
                    // Backend might use 0-6 or 1-7. Assuming 0=Monday based on my config.
                    // Need to check backend model or assume consistent.
                    // If backend sends 'day_of_week' matching 'id' here:
                    const match = routineDays.find(rd => rd.day_of_week === d.id);
                    return {
                        ...d,
                        selected: !!match,
                        routineDayId: match?.id
                    };
                });
                this.days.set(updated);
            },
            error: (err) => console.error('Error loading routine', err)
        });
    }

    toggleDay(day: DayOption): void {
        if (this.isEditMode()) {
            this.handleEditModeToggle(day);
        } else {
            const currentDays = this.days();
            const updated = currentDays.map(d =>
                d.id === day.id ? { ...d, selected: !d.selected } : d
            );
            this.days.set(updated);
        }
    }

    handleEditModeToggle(day: DayOption): void {
        const routineId = this.editingRoutineId();
        if (!routineId) return;

        if (day.selected) {
            // Deselecting -> Delete Day
            if (confirm(`¿Eliminar el día ${day.full} de la rutina? Se borrarán sus ejercicios.`)) {
                if (day.routineDayId) {
                    this.api.deleteRoutineDay(day.routineDayId).subscribe({
                        next: () => this.loadRoutine(routineId),
                        error: (err) => console.error('Error deleting day', err)
                    });
                }
            }
        } else {
            // Selecting -> Create Day
            const nextOrder = (this.editingRoutine()?.days?.length || 0) + 1;
            const data = {
                routine: routineId,
                day_label: day.full,
                title: 'Entrenamiento',
                day_of_week: day.id,
                order: nextOrder,
                is_completed: false
            };
            this.api.createRoutineDay(data).subscribe({
                next: () => this.loadRoutine(routineId),
                error: (err) => console.error('Error creating day', err)
            });
        }
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

        if (this.isEditMode()) {
            this.saveEditChanges();
            return;
        }

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

    saveEditChanges(): void {
        const routineId = this.editingRoutineId();
        if (routineId) {
            this.saving.set(true);
            const data = {
                title: this.routineName(),
                goal: this.routineDescription()
            };
            this.api.updateRoutine(routineId, data).subscribe({
                next: () => {
                    this.saving.set(false);
                    this.router.navigate(['/workouts']);
                },
                error: (err) => {
                    this.saving.set(false);
                    console.error('Error updating routine', err);
                }
            });
        }
    }

    deleteRoutine(): void {
        const routineId = this.editingRoutineId();
        if (routineId && confirm('¿Estás seguro de eliminar esta rutina y todo su contenido?')) {
            this.api.deleteRoutine(routineId).subscribe({
                next: () => this.router.navigate(['/workouts']),
                error: (err) => console.error('Error deleting routine', err)
            });
        }
    }

    editDayDetails(day: DayOption): void {
        if (this.isEditMode() && day.routineDayId && this.editingRoutineId()) {
            this.router.navigate(['/workouts/routine', this.editingRoutineId(), 'day', day.routineDayId, 'edit']);
        }
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
