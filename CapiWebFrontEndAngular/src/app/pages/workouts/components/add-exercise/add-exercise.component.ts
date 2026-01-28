import { Component, OnInit, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { firstValueFrom } from 'rxjs';
import { NavigationHistoryService } from '../../../../services/navigation-history.service';
import { PendingRoutine, PendingExercise } from '../create-routine/create-routine.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';

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
    imports: [CommonModule, FormsModule, ConfirmModalComponent],
    templateUrl: './add-exercise.component.html',
    styleUrls: []
})
export class AddExerciseComponent implements OnInit {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private navHistory = inject(NavigationHistoryService);

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
    baseExerciseId = signal<number | null>(null); // ID of the base Exercise in the library

    // Modal states
    showIconPicker = signal<boolean>(false);
    showCategoryPicker = signal<boolean>(false);

    // Image state
    @ViewChild('exerciseImagesInput') exerciseImagesInput!: ElementRef<HTMLInputElement>;
    exerciseImages = signal<{ file: File; preview: string }[]>([]);

    // Delete Modal state
    showDeleteVariantModal = signal<boolean>(false);
    variantToDeleteIndex = signal<number | null>(null);

    // Options
    iconOptions = [
        'fitness_center', 'accessibility_new', 'directions_run', 'self_improvement',
        'sports_gymnastics', 'monitor_heart', 'sprint', 'hiking',
        'sports_martial_arts', 'assets/icons/maquina_gimnasio.png', 'pool', 'sports_kabaddi'
    ];

    categoryOptions = ['Pecho', 'Espalda', 'Hombros', 'Brazos', 'Piernas', 'Core', 'Cardio', 'Cuerpo Completo'];
    equipmentOptions = ['Barra', 'Mancuernas', 'Peso Corporal', 'Cable', 'Máquina', 'Kettlebell', 'Bandas'];

    // Common exercises suggestions (Fetched from API)
    suggestions: ExerciseSuggestion[] = [];

    quickReps = [6, 8, 10, 12, 15];
    quickWeightIncrements = [2.5, 5, 10];

    // Cardio exercise support
    isCardio = signal<boolean>(false);
    duration = signal<number>(0);     // Minutes
    distance = signal<number>(0);     // Km
    resistance = signal<number>(0);   // 1-20

    quickDurations = [10, 15, 20, 30, 45];
    quickDistances = [1, 2, 3, 5, 10];

    toggleCardio(): void {
        this.isCardio.update(v => !v);
    }

    updateDuration(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.duration.set(parseInt(input.value) || 0);
    }

    setQuickDuration(value: number): void {
        this.duration.set(value);
    }

    updateDistance(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.distance.set(parseFloat(input.value) || 0);
    }

    setQuickDistance(value: number): void {
        this.distance.set(value);
    }

    updateResistance(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.resistance.set(parseInt(input.value) || 0);
    }

    incrementResistance(): void {
        this.resistance.update(v => Math.min(v + 1, 20));
    }

    decrementResistance(): void {
        this.resistance.update(v => Math.max(v - 1, 0));
    }

    // Variant support
    variants = signal<PendingExercise[]>([]);
    showVariantSection = signal<boolean>(false);
    showVariantPicker = signal<boolean>(false);
    variantSearchQuery = signal<string>('');

    // Variant parent tracking (when coming from exercise-detail)
    variantParentId = signal<number | null>(null);
    variantParentSlug = signal<string | null>(null);
    variantParentName = signal<string>('');

    // Toggle variant section visibility
    toggleVariantSection(): void {
        this.showVariantSection.update(v => !v);
    }

    // Variant picker
    openVariantPicker(): void {
        this.variantSearchQuery.set('');
        this.showVariantPicker.set(true);
    }

    closeVariantPicker(): void {
        this.showVariantPicker.set(false);
    }

    filteredVariantSuggestions(): ExerciseSuggestion[] {
        const query = this.variantSearchQuery().toLowerCase();
        const currentName = this.exerciseName().toLowerCase();
        // Filter out current exercise from suggestions
        return this.suggestions
            .filter(s => s.name.toLowerCase() !== currentName)
            .filter(s => !query || s.name.toLowerCase().includes(query) || s.category.toLowerCase().includes(query))
            .slice(0, 5);
    }

    addVariant(suggestion: ExerciseSuggestion): void {
        this.variants.update(v => [...v, {
            id: suggestion.id,
            name: suggestion.name,
            sets: this.sets(),
            reps: this.reps(),
            weight: this.weight(),
            notes: ''
        }]);
        this.closeVariantPicker();
    }

    removeVariant(index: number): void {
        this.variantToDeleteIndex.set(index);
        this.showDeleteVariantModal.set(true);
    }

    cancelDeleteVariant(): void {
        this.showDeleteVariantModal.set(false);
        this.variantToDeleteIndex.set(null);
    }

    confirmDeleteVariant(): void {
        const index = this.variantToDeleteIndex();
        if (index === null) return;

        const variant = this.variants()[index];
        if (variant.variantId) {
            // Delete from API
            this.api.deleteRoutineExercise(variant.variantId).subscribe({
                next: () => {
                    this.variants.update(v => v.filter((_, i) => i !== index));
                    this.cancelDeleteVariant();
                },
                error: (err) => {
                    console.error('Error deleting variant', err);
                    this.cancelDeleteVariant();
                }
            });
        } else {
            // Just remove from list (local only)
            this.variants.update(v => v.filter((_, i) => i !== index));
            this.cancelDeleteVariant();
        }
    }

    openCreateExerciseForVariant(): void {
        this.closeVariantPicker();

        // We use editingExerciseId because we are adding a variant to the ROUTINE EXERCISE, not the library exercise directly
        let parentId = this.editingExerciseId();
        let parentName = this.exerciseName();
        let parentSlug = this.editingExerciseSlug();

        if (!parentId) {
            console.error("Cannot create variant without a parent exercise ID");
            return;
        }

        // Set state for "Creating Variant"
        this.variantParentId.set(parentId);
        this.variantParentName.set(parentName);
        if (parentSlug) this.variantParentSlug.set(parentSlug);

        // Reset form for new exercise
        this.exerciseName.set('');
        // Keep category/equipment as defaults from parent

        // Reset ID tracking to force creation behavior
        this.isUpdateMode.set(false);
        this.editingExerciseId.set(null);
        this.editingExerciseSlug.set(null);

        // Clear images
        this.exerciseImages.set([]);
        this.existingImages.set([]);

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }



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

        // Also set default sets/reps if available (needs extending ExerciseSuggestion interface if we want typesafety, but 'any' works for now)
        if ((suggestion as any).original) {
            const orig = (suggestion as any).original;
            this.sets.set(orig.default_sets || 3);
            this.reps.set(orig.default_reps || 10);
            this.weight.set(orig.default_weight || 0);
        }
    }

    filteredSuggestions(): ExerciseSuggestion[] {
        const query = this.exerciseName().toLowerCase();
        if (!query) return this.suggestions;
        return this.suggestions.filter(s =>
            s.name.toLowerCase().includes(query) ||
            s.category.toLowerCase().includes(query)
        );
    }

    canSave(): boolean {
        if (this.exerciseName().trim().length === 0) return false;

        if (this.isCardio()) {
            // For cardio, at least duration should be set
            return this.duration() > 0;
        } else {
            // For strength, sets and reps are required
            return this.sets() > 0 && this.reps() > 0;
        }
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
    // Add slug signals for navigation
    editingRoutineSlug = signal<string | null>(null);
    editingDaySlug = signal<string | null>(null);
    editingExerciseSlug = signal<string | null>(null);

    returnUrl = signal<string | null>(null);

    async ngOnInit(): Promise<void> {
        // Preload image icons to ensure instant display in picker
        this.iconOptions.forEach(icon => {
            if (icon.includes('/') || icon.includes('.')) {
                const img = new Image();
                img.src = icon;
            }
        });

        await this.loadSuggestions();

        this.route.paramMap.subscribe(params => {
            const routineSlug = params.get('routineSlug');
            const daySlug = params.get('daySlug');
            const exerciseSlug = params.get('exerciseSlug');

            if (routineSlug && daySlug) {
                this.isEditMode.set(true);
                this.editingRoutineSlug.set(routineSlug);
                this.editingDaySlug.set(daySlug);

                if (exerciseSlug) {
                    this.isUpdateMode.set(true);
                    this.editingExerciseSlug.set(exerciseSlug);
                    this.loadEditingExercise(exerciseSlug);
                } else {
                    // Adding new exercise to existing day - load day to get its ID
                    this.loadDayInfo(routineSlug, daySlug);
                }
            } else {
                const indexParam = params.get('dayIndex');
                const index = indexParam ? parseInt(indexParam) : 0;
                this.dayIndex.set(index);
            }
        });

        // Check for variant parent query params
        this.route.queryParamMap.subscribe(queryParams => {
            const parentId = queryParams.get('variantParentId');
            const parentName = queryParams.get('variantParentName');
            const parentSlug = queryParams.get('variantParentSlug');

            if (parentId) {
                this.variantParentId.set(parseInt(parentId));
                this.variantParentName.set(parentName || '');
                if (parentSlug) this.variantParentSlug.set(parentSlug);
            }
        });

        // Read returnUrl from sessionStorage instead of query params
        const storedReturnUrl = this.navHistory.peekReturnUrl();
        if (storedReturnUrl) {
            this.returnUrl.set(storedReturnUrl);
        }
    }

    async loadSuggestions() {
        try {
            const response: any = await firstValueFrom(this.api.getExerciseLibrary(false));
            const exercises = Array.isArray(response) ? response : (response.results || []);

            this.suggestions = exercises.map((ex: any) => ({
                id: ex.id,
                name: ex.name,
                category: this.extractCategory(ex.description) || 'Cuerpo Completo',
                equipment: this.extractEquipment(ex.description) || 'Peso Corporal',
                icon: ex.icon || 'fitness_center',
                original: ex
            }));
        } catch (e) {
            console.error('Error loading suggestions', e);
        }
    }

    extractCategory(desc: string): string | null {
        if (desc && desc.includes(' - ')) {
            return desc.split(' - ')[0];
        }
        return null;
    }

    extractEquipment(desc: string): string | null {
        if (desc && desc.includes(' - ')) {
            const parts = desc.split(' - ');
            return parts.length > 1 ? parts[1] : null;
        }
        return null;
    }

    loadDayInfo(routineSlug: string, daySlug: string): void {
        this.api.getRoutine(routineSlug).subscribe({
            next: (routine: any) => {
                // Find the day by url_slug or short_id prefix
                const day = routine.days?.find((d: any) =>
                    d.url_slug === daySlug || (d.short_id && daySlug?.startsWith(d.short_id + '-'))
                );
                if (day) {
                    this.editingRoutineId.set(routine.id);
                    this.editingDayId.set(day.id);
                }
            },
            error: (err) => console.error('Error loading day info', err)
        });
    }

    loadEditingExercise(idOrSlug: number | string): void {
        this.api.getRoutineExercise(idOrSlug).subscribe({
            next: (data) => {
                // Store IDs for API operations
                this.editingExerciseId.set(data.id);
                this.editingRoutineId.set(data.routine_id);
                this.editingDayId.set(data.routine_day_id);

                this.exerciseName.set(data.custom_name || data.exercise_detail.name); // Use custom name if available
                this.sets.set(data.target_sets);
                this.reps.set(data.target_reps);
                this.weight.set(data.target_weight);
                this.notes.set(data.note || '');
                // Load icon if available, otherwise default or from suggestion match
                if (data.icon) {
                    this.selectedIcon.set(data.icon);
                } else {
                    // Try to guess from suggestions
                    const match = this.suggestions.find(s => s.name === data.exercise_detail.name);
                    this.selectedIcon.set(match?.icon || 'fitness_center');
                }

                // Load cardio fields
                this.isCardio.set(data.is_cardio || false);
                this.duration.set(data.target_duration_minutes || 0);
                this.distance.set(data.target_distance_km || 0);
                this.resistance.set(data.target_resistance || 0);


                if (data.variants && data.variants.length > 0) {
                    const mappedVariants: PendingExercise[] = data.variants.map((v: any) => ({
                        id: v.exercise_detail.id, // ID of the Exercise (Library)
                        variantId: v.id, // ID of the RoutineExercise variant
                        name: v.exercise_detail.name,
                        sets: v.target_sets,
                        reps: v.target_reps,
                        weight: v.target_weight,
                        notes: ''
                    }));
                    this.variants.set(mappedVariants);
                    this.showVariantSection.set(true);
                }

                // Store the base exercise ID for image uploads
                if (data.exercise_detail?.id) {
                    this.baseExerciseId.set(data.exercise_detail.id);
                }
                if (data.exercise_detail?.media) {
                    const media = data.exercise_detail.media;
                    this.existingImages.set(
                        media.filter((m: any) => m.media_type === 'image')
                            .map((m: any) => ({
                                id: m.id,
                                url: m.file_url || m.file // Prefer absolute URL
                            }))
                    );
                } else {
                    this.existingImages.set([]);
                }
            },
            error: (err) => console.error('Error loading exercise', err)
        });
    }

    close(): void {
        const returnUrl = this.returnUrl();
        if (returnUrl) {
            // Consume and clear only the return URL, preserving previous URL for the detail page
            this.navHistory.getReturnUrl();
            // Use replaceUrl to avoid creating duplicate history entries
            this.router.navigateByUrl(returnUrl, { replaceUrl: true });
            return;
        }

        if (this.isEditMode()) {
            this.router.navigate(['/workouts/routine', this.editingRoutineSlug(), 'day', this.editingDaySlug(), 'edit'], { replaceUrl: true });
        } else {
            this.router.navigate(['/workouts/create/day', this.dayIndex()]);
        }
    }

    goToCreate(): void {
        this.router.navigate(['/workouts/routine', this.editingRoutineSlug(), 'day', this.editingDaySlug(), 'add']);
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
                    note: this.notes(),
                    icon: this.selectedIcon(),
                    custom_name: this.exerciseName(),
                    // Cardio fields
                    is_cardio: this.isCardio(),
                    target_duration_minutes: this.duration(),
                    target_distance_km: this.distance(),
                    target_resistance: this.resistance()
                };

                this.api.updateRoutineExercise(this.editingExerciseId()!, updateData).subscribe({
                    next: (updatedExercise: any) => {
                        // FIX: Update return URL if slug changed and we are returning to the exercise detail
                        if (updatedExercise && updatedExercise.url_slug) {
                            const currentReturn = this.returnUrl();
                            // Check if we are returning to an exercise detail view
                            if (currentReturn && currentReturn.includes('/workouts/exercise/')) {
                                this.returnUrl.set(`/workouts/exercise/${updatedExercise.url_slug}`);
                            }
                        }

                        // Upload images if any were added
                        this.uploadPendingImages().then(() => this.close());
                    },
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
                    const parentId = this.variantParentId();



                    // If we have a variant parent, add as variant instead of new exercise
                    if (parentId && exerciseId) {
                        // Set baseExerciseId so images are uploaded to the correct exercise (the newly created library exercise)
                        this.baseExerciseId.set(exerciseId);

                        // Upload images first, then add as variant
                        this.uploadPendingImages().then(() => {
                            const variantData = {
                                exercise: exerciseId,
                                target_sets: this.sets(),
                                target_reps: this.reps(),
                                target_weight: this.weight()
                            };
                            this.api.addExerciseVariant(parentId, variantData).subscribe({
                                next: () => {
                                    // Navigate back to the exercise detail
                                    // Set previousUrl in sessionStorage for the exercise detail
                                    this.navHistory.setPreviousUrl(this.returnUrl() || '/workouts');
                                    const parentSlug = this.variantParentSlug() || parentId;
                                    this.router.navigate(['/workouts/exercise', parentSlug]);
                                },
                                error: (err) => {
                                    this.saving.set(false);
                                    console.error('Error adding variant', err);
                                }
                            });
                        });
                        return;
                    }

                    if (exerciseId && dayId) {
                        const routineExerciseData = {
                            routine_day: dayId,
                            exercise: exerciseId,
                            target_sets: this.sets(),
                            target_reps: this.reps(),
                            target_weight: this.weight(),
                            note: this.notes(),
                            order: 999,
                            icon: this.selectedIcon(),
                            // Cardio fields
                            is_cardio: this.isCardio(),
                            target_duration_minutes: this.duration(),
                            target_distance_km: this.distance(),
                            target_resistance: this.resistance()
                        };

                        this.api.createRoutineExercise(routineExerciseData).subscribe({
                            next: () => this.close(),
                            error: (err) => {
                                this.saving.set(false);
                                console.error('Error creating routine exercise', err);
                            }
                        });
                    } else {
                        console.error('Missing exerciseId or dayId - exerciseId:', exerciseId, 'dayId:', dayId);
                        this.saving.set(false);
                        this.error.set('Error: No se pudo determinar el día de la rutina');
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

    async uploadPendingImages(): Promise<void> {
        const images = this.exerciseImages();
        const exerciseId = this.baseExerciseId();

        if (images.length === 0 || !exerciseId) {
            return;
        }

        const files = images.map(img => img.file);

        return new Promise((resolve, reject) => {
            this.api.uploadExerciseImages(exerciseId, files).subscribe({
                next: () => resolve(),
                error: (err) => {
                    console.error('Error uploading images', err);
                    resolve(); // Still resolve to not block navigation
                }
            });
        });
    }
    // Existing images (from backend)
    existingImages = signal<any[]>([]);

    // Confirmation Modal State
    showDeleteModal = signal<boolean>(false);
    imageToDeleteId = signal<number | null>(null);

    removeExistingImage(mediaId: number): void {
        this.imageToDeleteId.set(mediaId);
        this.showDeleteModal.set(true);
    }

    confirmDeleteImage(): void {
        const mediaId = this.imageToDeleteId();
        const exerciseId = this.baseExerciseId();

        if (!mediaId || !exerciseId) return;

        this.api.deleteExerciseImage(exerciseId, mediaId).subscribe({
            next: () => {
                this.existingImages.update(images => images.filter(img => img.id !== mediaId));
                this.cancelDeleteImage();
            },
            error: (err) => {
                console.error('Error deleting image', err);
                this.cancelDeleteImage();
            }
        });
    }

    cancelDeleteImage(): void {
        this.showDeleteModal.set(false);
        this.imageToDeleteId.set(null);
    }
}
