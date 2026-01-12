import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { RoutineExercise, ExerciseProgressPoint } from '../../../../models/workouts';

@Component({
    selector: 'app-exercise-detail',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './exercise-detail.component.html',
    styleUrls: ['./exercise-detail.component.css']
})
export class ExerciseDetailComponent implements OnInit {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    exercise = signal<RoutineExercise | null>(null);
    progressData = signal<ExerciseProgressPoint[]>([]);
    loading = signal<boolean>(true);
    error = signal<string | null>(null);

    // Target display values
    targetSets = signal<number>(3);
    targetReps = signal<string>('8-10');
    targetWeight = signal<number>(0);
    currentMaxWeight = signal<number>(0);
    progressPercent = signal<number>(0);

    // History items
    recentHistory = signal<Array<{ date: string; weight: number; reps: number; sets: number }>>([]);

    // Image carousel state
    exerciseImages = signal<Array<{ id: number; url: string }>>([]);
    currentImageIndex = signal<number>(0);

    ngOnInit(): void {
        const exerciseId = this.route.snapshot.paramMap.get('id');
        if (exerciseId) {
            this.loadExercise(parseInt(exerciseId));
        }
    }

    loadExercise(id: number): void {
        this.loading.set(true);
        this.error.set(null);

        // Load exercise details
        this.api.getRoutineExercise(id).subscribe({
            next: (data: RoutineExercise) => {
                this.exercise.set(data);
                this.targetSets.set(data.target_sets);
                this.targetReps.set(data.target_reps.toString());
                this.targetWeight.set(data.target_weight);

                // Load images from exercise media
                const media = data.exercise_detail?.media || [];
                const images = media
                    .filter((m: any) => m.media_type === 'image')
                    .map((m: any) => ({ id: m.id, url: m.file }));
                this.exerciseImages.set(images);
                this.currentImageIndex.set(0);

                // Load progress data
                this.loadProgress(id);
            },
            error: (err) => {
                console.error('Error loading exercise:', err);
                this.error.set('Error al cargar el ejercicio');
                this.loading.set(false);
            }
        });
    }

    loadProgress(id: number): void {
        this.api.getRoutineExerciseProgress(id).subscribe({
            next: (data: ExerciseProgressPoint[]) => {
                this.progressData.set(data);

                // Calculate max weight and progress
                if (data.length > 0) {
                    const maxWeight = Math.max(...data.map(d => d.max_weight || 0));
                    this.currentMaxWeight.set(maxWeight);

                    // Calculate progress (compare first and last entry)
                    if (data.length >= 2) {
                        const first = data[0].max_weight || 0;
                        const last = data[data.length - 1].max_weight || 0;
                        if (first > 0) {
                            this.progressPercent.set(Math.round(((last - first) / first) * 100));
                        }
                    }

                    // Build history from progress data
                    const history = data.slice(-3).reverse().map(point => ({
                        date: this.formatDate(point.day),
                        weight: point.max_weight || 0,
                        reps: point.max_reps || 0,
                        sets: 3 // Assume 3 sets as we don't have this data
                    }));
                    this.recentHistory.set(history);
                }
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading progress:', err);
                // Still show the component but without progress data
                this.loading.set(false);
            }
        });
    }

    formatDate(dateStr: string): string {
        const date = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
    }

    goBack(): void {
        this.router.navigate(['/workouts']);
    }

    logNewSet(): void {
        // TODO: Open modal to log a new set
        console.log('Log new set for exercise:', this.exercise()?.id);
    }

    editTarget(): void {
        // TODO: Open modal to edit target
        console.log('Edit target for exercise:', this.exercise()?.id);
    }

    // Carousel navigation
    nextImage(): void {
        const images = this.exerciseImages();
        if (images.length > 0) {
            this.currentImageIndex.update(i => (i + 1) % images.length);
        }
    }

    prevImage(): void {
        const images = this.exerciseImages();
        if (images.length > 0) {
            this.currentImageIndex.update(i => (i - 1 + images.length) % images.length);
        }
    }

    goToImage(index: number): void {
        this.currentImageIndex.set(index);
    }
}
