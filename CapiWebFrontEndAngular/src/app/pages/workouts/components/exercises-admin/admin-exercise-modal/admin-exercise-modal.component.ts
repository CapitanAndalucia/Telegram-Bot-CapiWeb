import { Component, ElementRef, OnInit, ViewChild, inject, input, output, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../../../../services/api-client.service';
import { firstValueFrom } from 'rxjs';

interface ExerciseSuggestion {
    id: number;
    name: string;
    category: string;
    equipment: string;
    icon: string;
}

@Component({
    selector: 'app-admin-exercise-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './admin-exercise-modal.component.html'
})
export class AdminExerciseModalComponent implements OnInit {
    private api = inject(ApiClientService);

    // Inputs/Outputs
    exercise = input<any>(null); // If provided, we are in Edit Mode
    onClose = output<void>();
    onSaved = output<any>(); // Emits the saved exercise object

    // State
    processing = signal<boolean>(false);

    // Form Data
    exerciseName = signal<string>('');
    description = signal<string>('');
    selectedIcon = signal<string>('fitness_center');
    selectedCategory = signal<string>('Strength');
    selectedEquipment = signal<string>('Barbell');
    sets = signal<number>(3);
    reps = signal<number>(10);
    weight = signal<number>(0);

    // Internal ID if editing
    editingId = signal<number | null>(null);

    // Pickers State
    showIconPicker = signal<boolean>(false);
    showCategoryPicker = signal<boolean>(false);

    // Images
    @ViewChild('exerciseImagesInput') exerciseImagesInput!: ElementRef<HTMLInputElement>;
    exerciseImages = signal<{ file: File; preview: string }[]>([]);
    existingImages = signal<any[]>([]); // For existing images in edit mode

    // Options (Copied from AddExerciseComponent)
    iconOptions = [
        'fitness_center', 'accessibility_new', 'directions_run', 'self_improvement',
        'sports_gymnastics', 'monitor_heart', 'sprint', 'hiking',
        'sports_martial_arts', 'assets/icons/maquina_gimnasio.png', 'pool', 'sports_kabaddi'
    ];
    categoryOptions = ['Pecho', 'Espalda', 'Hombros', 'Brazos', 'Piernas', 'Core', 'Cardio', 'Cuerpo Completo'];
    equipmentOptions = ['Barra', 'Mancuernas', 'Peso Corporal', 'Cable', 'Máquina', 'Kettlebell', 'Bandas'];

    suggestions: ExerciseSuggestion[] = [];

    constructor() {
        // Effect to load data when input changes
        effect(() => {
            const ex = this.exercise();
            if (ex) {
                this.loadExerciseData(ex);
            }
        });
    }

    async ngOnInit() {
        // Preload icons
        this.iconOptions.forEach(icon => {
            if (icon.includes('/') || icon.includes('.')) {
                const img = new Image();
                img.src = icon;
            }
        });

        await this.loadSuggestions();
    }

    async loadSuggestions() {
        try {
            const response: any = await firstValueFrom(this.api.getExerciseLibrary(false));
            const exercises = Array.isArray(response) ? response : (response.results || []);

            // Map API exercises to suggestions format
            this.suggestions = exercises.map((ex: any) => ({
                id: ex.id,
                name: ex.name,
                // If backend doesn't give explicit category/equipment columns, 
                // we might try to extract from description or use defaults.
                category: this.extractCategory(ex.description) || 'Cuerpo Completo',
                equipment: this.extractEquipment(ex.description) || 'Peso Corporal',
                icon: ex.icon || 'fitness_center',
                // Keep original object for full details
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

    loadExerciseData(ex: any) {
        this.editingId.set(ex.id);
        this.exerciseName.set(ex.name);
        this.description.set(ex.description || '');
        this.selectedIcon.set(ex.icon || 'fitness_center');

        if (ex.media && Array.isArray(ex.media)) {
            this.existingImages.set(ex.media.filter((m: any) => m.media_type === 'image'));
        } else if (ex.exercise_detail && ex.exercise_detail.media) {
            this.existingImages.set(ex.exercise_detail.media.filter((m: any) => m.media_type === 'image'));
        } else {
            this.existingImages.set([]);
        }

        if (ex.description && ex.description.includes(' - ')) {
            const parts = ex.description.split(' - ');
            if (parts.length >= 2) {
                this.selectedCategory.set(parts[0]);
                this.selectedEquipment.set(parts[1]);
            }
        }

        this.sets.set(ex.default_sets || 3);
        this.reps.set(ex.default_reps || 10);
        this.weight.set(ex.default_weight || 0);
    }

    // --- Actions ---

    updateName(val: string) {
        this.exerciseName.set(val);
    }

    clearName() {
        this.exerciseName.set('');
    }

    async selectSuggestion(suggestion: ExerciseSuggestion) {
        this.exerciseName.set(suggestion.name);
        this.selectedCategory.set(suggestion.category);
        this.selectedEquipment.set(suggestion.equipment);
        this.selectedIcon.set(suggestion.icon);

        // Also set defaults if available in original
        if ((suggestion as any).original) {
            const orig = (suggestion as any).original;
            this.sets.set(orig.default_sets || 3);
            this.reps.set(orig.default_reps || 10);
            this.weight.set(orig.default_weight || 0);
            this.description.set(orig.description || '');
        }
    }

    filteredSuggestions() {
        const query = this.exerciseName().toLowerCase();
        if (!query) return this.suggestions;
        return this.suggestions.filter(s =>
            s.name.toLowerCase().includes(query) ||
            s.category.toLowerCase().includes(query)
        );
    }

    // --- Pickers ---
    openIconPicker() { this.showIconPicker.set(true); }
    closeIconPicker() { this.showIconPicker.set(false); }
    selectIcon(icon: string) { this.selectedIcon.set(icon); this.closeIconPicker(); }

    openCategoryPicker() { this.showCategoryPicker.set(true); }
    closeCategoryPicker() { this.showCategoryPicker.set(false); }
    selectCategory(cat: string) { this.selectedCategory.set(cat); }
    selectEquipment(eq: string) { this.selectedEquipment.set(eq); }

    // --- Stats ---
    incrementSets() { this.sets.update(v => Math.min(v + 1, 10)); }
    decrementSets() { this.sets.update(v => Math.max(v - 1, 1)); }

    // --- Images ---
    openImagePicker() { this.exerciseImagesInput?.nativeElement.click(); }

    onImagesSelected(event: Event) {
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

    removeImage(index: number) {
        this.exerciseImages.update(images => images.filter((_, i) => i !== index));
    }

    async removeExistingImage(mediaId: number) {
        if (!confirm('¿Eliminar esta imagen?')) return;

        try {
            await firstValueFrom(this.api.deleteExerciseImage(this.editingId()!, mediaId));
            this.existingImages.update(images => images.filter((img: any) => img.id !== mediaId));
        } catch (e) {
            console.error('Error deleting image', e);
            alert('Error al eliminar imagen');
        }
    }

    // --- Save ---
    canSave() {
        return this.exerciseName().trim().length > 0;
    }

    close() {
        this.onClose.emit();
    }

    async onSave() {
        if (!this.canSave() || this.processing()) return;
        this.processing.set(true);

        const data = {
            name: this.exerciseName(),
            description: this.description() || `${this.selectedCategory()} - ${this.selectedEquipment()}`,
            default_sets: this.sets(),
            default_reps: this.reps(),
            default_weight: this.weight(),
            icon: this.selectedIcon(),
            is_custom: false // Admin created exercises are templates
        };

        try {
            let result;
            if (this.editingId()) {
                // Update
                result = await firstValueFrom(this.api.updateExercise(this.editingId()!, data));
            } else {
                // Create
                // getOrCreate returns { exercise, created }
                const response: any = await firstValueFrom(this.api.getOrCreateExercise(data));
                result = response.exercise || response;
            }

            // Handle Images
            if (this.exerciseImages().length > 0 && result.id) {
                const files = this.exerciseImages().map(img => img.file);
                await firstValueFrom(this.api.uploadExerciseImages(result.id, files));

                // Refresh exercise to get the uploaded images
                result = await firstValueFrom(this.api.getExercise(result.id));
            }

            this.onSaved.emit(result);
            this.onClose.emit();

        } catch (e) {
            console.error('Error saving exercise', e);
            alert('Error al guardar.');
        } finally {
            this.processing.set(false);
        }
    }
}
