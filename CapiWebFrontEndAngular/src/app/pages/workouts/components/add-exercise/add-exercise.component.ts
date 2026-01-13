import { Component, OnInit, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { PendingRoutine, PendingExercise } from '../create-routine/create-routine.component';

interface ExerciseSuggestion {
    id: number;
    name: string;
    category: string;
    equipment: string;
    icon: string;
}

@Component({
    selector: 'app-add-exercise',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './add-exercise.component.html',
    styleUrls: []
})
export class AddExerciseComponent implements OnInit {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    dayIndex = signal<number>(0);
    saving = signal<boolean>(false);
    error = signal<string | null>(null);

    // Exercise data
    exerciseName = signal<string>('');
    selectedIcon = signal<string>('fitness_center');
    selectedCategory = signal<string>('Strength');
    selectedEquipment = signal<string>('Barbell');
    sets = signal<number>(3);
    reps = signal<number>(10);
    weight = signal<number>(0);
    notes = signal<string>('');

    // Modal states
    showIconPicker = signal<boolean>(false);
    showCategoryPicker = signal<boolean>(false);

    // Image state
    @ViewChild('exerciseImagesInput') exerciseImagesInput!: ElementRef<HTMLInputElement>;
    exerciseImages = signal<{ file: File; preview: string }[]>([]);

    // Options
    iconOptions = [
        'fitness_center', 'accessibility_new', 'directions_run', 'self_improvement',
        'sports_gymnastics', 'monitor_heart', 'sprint', 'hiking',
        'sports_martial_arts', 'exercise', 'pool', 'sports_kabaddi'
    ];

    categoryOptions = ['Pecho', 'Espalda', 'Hombros', 'Brazos', 'Piernas', 'Core', 'Cardio', 'Cuerpo Completo'];
    equipmentOptions = ['Barra', 'Mancuernas', 'Peso Corporal', 'Cable', 'Máquina', 'Kettlebell', 'Bandas'];

    // Common exercises suggestions
    suggestions: ExerciseSuggestion[] = [
        { id: 1, name: 'Sentadilla con Barra', category: 'Piernas', equipment: 'Barra', icon: 'fitness_center' },
        { id: 2, name: 'Peso Muerto Rumano', category: 'Piernas', equipment: 'Barra', icon: 'fitness_center' },
        { id: 3, name: 'Zancadas', category: 'Piernas', equipment: 'Peso Corporal', icon: 'directions_run' },
        { id: 4, name: 'Press de Banca', category: 'Pecho', equipment: 'Barra', icon: 'fitness_center' },
        { id: 5, name: 'Dominadas', category: 'Espalda', equipment: 'Peso Corporal', icon: 'accessibility_new' },
        { id: 6, name: 'Press Militar', category: 'Hombros', equipment: 'Barra', icon: 'fitness_center' },
        { id: 7, name: 'Curl de Bíceps', category: 'Brazos', equipment: 'Mancuernas', icon: 'fitness_center' },
        { id: 8, name: 'Extensiones de Tríceps', category: 'Brazos', equipment: 'Cable', icon: 'fitness_center' }
    ];

    quickReps = [6, 8, 10, 12, 15];
    quickWeightIncrements = [2.5, 5, 10];



    updateExerciseName(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.exerciseName.set(input.value);
    }

    clearName(): void {
        this.exerciseName.set('');
    }

    selectSuggestion(suggestion: ExerciseSuggestion): void {
        this.exerciseName.set(suggestion.name);
        this.selectedCategory.set(suggestion.category);
        this.selectedEquipment.set(suggestion.equipment);
        this.selectedIcon.set(suggestion.icon);
    }

    filteredSuggestions(): ExerciseSuggestion[] {
        const query = this.exerciseName().toLowerCase();
        if (!query) return this.suggestions.slice(0, 5);
        return this.suggestions.filter(s =>
            s.name.toLowerCase().includes(query) ||
            s.category.toLowerCase().includes(query)
        ).slice(0, 5);
    }

    canSave(): boolean {
        return this.exerciseName().trim().length > 0 && this.sets() > 0 && this.reps() > 0;
    }

    // Icon Picker
    openIconPicker(): void {
        this.showIconPicker.set(true);
    }

    closeIconPicker(): void {
        this.showIconPicker.set(false);
    }

    selectIcon(icon: string): void {
        this.selectedIcon.set(icon);
        this.closeIconPicker();
    }

    // Category Picker
    openCategoryPicker(): void {
        this.showCategoryPicker.set(true);
    }

    closeCategoryPicker(): void {
        this.showCategoryPicker.set(false);
    }

    selectCategory(category: string): void {
        this.selectedCategory.set(category);
    }

    selectEquipment(equipment: string): void {
        this.selectedEquipment.set(equipment);
    }

    // Sets/Reps/Weight
    incrementSets(): void {
        this.sets.update(v => Math.min(v + 1, 10));
    }

    decrementSets(): void {
        this.sets.update(v => Math.max(v - 1, 1));
    }

    updateReps(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.reps.set(parseInt(input.value) || 0);
    }

    setQuickReps(value: number): void {
        this.reps.set(value);
    }

    updateWeight(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.weight.set(parseFloat(input.value) || 0);
    }

    addWeight(increment: number): void {
        this.weight.update(v => v + increment);
    }

    updateNotes(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        this.notes.set(textarea.value);
    }

    isEditMode = signal<boolean>(false);
    isUpdateMode = signal<boolean>(false); // True if editing existing exercise
    editingRoutineId = signal<number | null>(null);
    editingDayId = signal<number | null>(null);
    editingExerciseId = signal<number | null>(null);

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            const routineId = params.get('routineId');
            const dayId = params.get('dayId');
            const exerciseId = params.get('exerciseId');

            if (routineId && dayId) {
                this.isEditMode.set(true);
                this.editingRoutineId.set(parseInt(routineId));
                this.editingDayId.set(parseInt(dayId));

                if (exerciseId) {
                    this.isUpdateMode.set(true);
                    this.editingExerciseId.set(parseInt(exerciseId));
                    this.loadEditingExercise(parseInt(exerciseId));
                }
            } else {
                const indexParam = params.get('dayIndex');
                const index = indexParam ? parseInt(indexParam) : 0;
                this.dayIndex.set(index);
            }
        });
    }

    loadEditingExercise(id: number): void {
        this.api.getRoutineExercise(id).subscribe({
            next: (data) => {
                this.exerciseName.set(data.exercise_detail.name);
                this.sets.set(data.target_sets);
                this.reps.set(data.target_reps);
                this.weight.set(data.target_weight);
                this.notes.set(data.note || '');
            },
            error: (err) => console.error('Error loading exercise', err)
        });
    }

    close(): void {
        if (this.isEditMode()) {
            this.router.navigate(['/workouts/routine', this.editingRoutineId(), 'day', this.editingDayId(), 'edit']);
        } else {
            this.router.navigate(['/workouts/create/day', this.dayIndex()]);
        }
    }

    save(): void {
        if (!this.canSave() || this.saving()) return;

        this.saving.set(true);
        this.error.set(null);

        // API logic for Edit Mode
        if (this.isEditMode()) {
            // Check if we are updating existing routine exercise
            if (this.isUpdateMode() && this.editingExerciseId()) {
                const updateData = {
                    target_sets: this.sets(),
                    target_reps: this.reps(),
                    target_weight: this.weight(),
                    note: this.notes()
                };
                this.api.updateRoutineExercise(this.editingExerciseId()!, updateData).subscribe({
                    next: () => this.close(),
                    error: (err) => {
                        this.saving.set(false);
                        console.error('Error updating exercise', err);
                    }
                });
                return;
            }

            // Creating new routine exercise in existing day
            this.api.getOrCreateExercise({
                name: this.exerciseName(),
                description: `${this.selectedCategory()} - ${this.selectedEquipment()}`,
                default_sets: this.sets(),
                default_reps: this.reps(),
                default_weight: this.weight()
            }).subscribe({
                next: (response) => {
                    const exerciseId = response.exercise?.id;
                    const dayId = this.editingDayId();

                    if (exerciseId && dayId) {
                        const routineExerciseData = {
                            day: dayId,
                            exercise: exerciseId,
                            target_sets: this.sets(),
                            target_reps: this.reps(),
                            target_weight: this.weight(),
                            note: this.notes(),
                            order: 999
                        };
                        this.api.createRoutineExercise(routineExerciseData).subscribe({
                            next: () => this.close(),
                            error: (err) => {
                                this.saving.set(false);
                                console.error('Error creating routine exercise', err);
                            }
                        });
                    }
                },
                error: (err) => {
                    this.saving.set(false);
                    console.error('Error creating base exercise', err);
                }
            });
            return;
        }

        // Create Mode (Original Logic)
        this.api.getOrCreateExercise({
            name: this.exerciseName(),
            description: `${this.selectedCategory()} - ${this.selectedEquipment()}`,
            default_sets: this.sets(),
            default_reps: this.reps(),
            default_weight: this.weight()
        }).subscribe({
            next: (response) => {
                const exerciseId = response.exercise?.id;
                const stored = sessionStorage.getItem('pendingRoutine');

                if (!stored) {
                    this.router.navigate(['/workouts/create']);
                    return;
                }

                const routine: PendingRoutine = JSON.parse(stored);
                const dayIdx = this.dayIndex();

                if (dayIdx >= 0 && dayIdx < routine.days.length) {
                    routine.days[dayIdx].exercises.push({
                        id: exerciseId,
                        name: this.exerciseName(),
                        sets: this.sets(),
                        reps: this.reps(),
                        weight: this.weight(),
                        notes: this.notes()
                    });

                    sessionStorage.setItem('pendingRoutine', JSON.stringify(routine));

                    // Handle Images (Pending Mode) implementation omitted for brevity/safety unless crucial
                    // Keeping simple navigation for now to avoid complexity issues with image upload in pending mode
                    this.close();
                }
            },
            error: (err) => {
                console.error('Error getting/creating exercise:', err);
                this.error.set('Error al guardar el ejercicio');
                this.saving.set(false);
            }
        });
    }

    // Image handling methods
    openImagePicker(): void {
        this.exerciseImagesInput?.nativeElement.click();
    }

    onImagesSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const files = Array.from(input.files);
            files.forEach(file => {
                if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const preview = e.target?.result as string;
                    this.exerciseImages.update(images => [...images, { file, preview }]);
                };
                reader.readAsDataURL(file);
            });
            input.value = '';
        }
    }

    removeImage(index: number): void {
        this.exerciseImages.update(images => images.filter((_, i) => i !== index));
    }
}
