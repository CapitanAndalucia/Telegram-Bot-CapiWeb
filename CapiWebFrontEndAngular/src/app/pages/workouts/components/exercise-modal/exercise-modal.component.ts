import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import {
    ExerciseProgressPoint,
    RoutineExercise,
} from '../../../../models/workouts';
import { ApiClientService } from '../../../../services/api-client.service';

// ... existing imports ...

@Component({
    selector: 'app-exercise-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, BaseChartDirective],
    templateUrl: './exercise-modal.component.html',
    styleUrls: []
})
export class ExerciseModalComponent {
    private api = inject(ApiClientService);

    @Input() exercise!: RoutineExercise;
    @Input() progress: ExerciseProgressPoint[] = [];
    @Input() loading = false;

    @Output() close = new EventEmitter<void>();
    @Output() created = new EventEmitter<any>();

    reps = signal<number>(10);
    weight = signal<number>(0);
    note = signal<string>('');
    mediaFile = signal<File | null>(null);
    submitting = signal<boolean>(false);
    activeMediaIndex = signal<number>(0);

    // ... rest of the component code ...

    chartConfig = computed<ChartConfiguration<'line'>>(() => {
        const labels = this.progress?.map(p => p.day) ?? [];
        const reps = this.progress?.map(p => p.total_reps ?? 0) ?? [];
        const weights = this.progress?.map(p => p.max_weight ?? 0) ?? [];

        return {
            type: 'line', // <--- obligatorio
            data: {
                labels,
                datasets: [
                    {
                        label: 'Reps/día',
                        data: reps,
                        borderColor: '#22d3ee',
                        backgroundColor: 'rgba(34,211,238,0.15)',
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Peso máximo',
                        data: weights,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139,92,246,0.15)',
                        tension: 0.3,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: true }
                }
            }
        };
    });

    changeMedia(step: number): void {
        const media = this.exercise?.exercise_detail?.media || [];
        if (!media.length) return;
        const next = (this.activeMediaIndex() + step + media.length) % media.length;
        this.activeMediaIndex.set(next);
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] ?? null;
        this.mediaFile.set(file);
    }

    addSet(): void {
        if (!this.exercise) return;
        this.submitting.set(true);
        const form = new FormData();
        form.append('routine_exercise', String(this.exercise.id));
        form.append('reps', String(this.reps()));
        form.append('weight', String(this.weight()));
        if (this.note()) form.append('note', this.note());
        const file = this.mediaFile();
        if (file) form.append('media', file);

        this.api.createExerciseSet(form).subscribe({
            next: (data) => {
                this.submitting.set(false);
                this.note.set('');
                this.mediaFile.set(null);
                this.created.emit(data);
            },
            error: () => {
                this.submitting.set(false);
            }
        });
    }
}








