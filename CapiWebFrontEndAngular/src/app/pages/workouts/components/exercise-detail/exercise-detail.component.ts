import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ApiClientService } from '../../../../services/api-client.service';
import { NavigationHistoryService } from '../../../../services/navigation-history.service';
import { RoutineExercise, ExerciseProgressPoint } from '../../../../models/workouts';
import { forkJoin } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType, Chart, registerables } from 'chart.js';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { trigger, transition, style, animate } from '@angular/animations';

// Register all Chart.js components (scales, controllers, elements)
Chart.register(...registerables);

@Component({
    selector: 'app-exercise-detail',
    standalone: true,
    imports: [CommonModule, BaseChartDirective, ConfirmModalComponent],
    templateUrl: './exercise-detail.component.html',
    styleUrls: [],
    styles: [`:host { display: block; }`],
    animations: [
        trigger('fullscreenModal', [
            transition(':enter', [
                style({ opacity: 0, transform: 'scale(1.05)' }),
                animate('250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    style({ opacity: 1, transform: 'scale(1)' })
                )
            ]),
            transition(':leave', [
                animate('200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    style({ opacity: 0, transform: 'scale(0.95)' })
                )
            ])
        ])
    ]
})
export class ExerciseDetailComponent implements OnInit {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private location = inject(Location);
    private navHistory = inject(NavigationHistoryService);

    exercise = signal<RoutineExercise | null>(null);
    exerciseFamily = signal<RoutineExercise | null>(null); // Parent with variants
    progressData = signal<ExerciseProgressPoint[]>([]);
    loading = signal<boolean>(true);
    weightChartLoading = signal<boolean>(true);
    error = signal<string | null>(null);

    // Target display values
    targetSets = signal<number>(3);
    targetReps = signal<string>('8-10');
    targetWeight = signal<number>(0);
    currentMaxWeight = signal<number>(0);
    lastCardioDistance = signal<number>(0);
    lastCardioDuration = signal<number>(0);
    progressPercent = signal<number>(0);

    // History items
    recentHistory = signal<Array<any>>([]); // Changed structure to hold raw sets or grouped sets

    // Image carousel state
    exerciseImages = signal<Array<{ id: number; url: string }>>([]);
    currentImageIndex = signal<number>(0);

    // --- Modals State ---
    showTargetModal = signal<boolean>(false);
    showLogModal = signal<boolean>(false);
    showTipModal = signal<boolean>(false);

    // --- Editing State (Name) ---
    isEditing = signal<boolean>(false);
    isSaving = signal<boolean>(false);
    editName = signal<string>('');

    // --- Inputs for Modals ---
    // Target Edit - Strength
    newTargetSets = signal<number>(0);
    newTargetReps = signal<string>('');
    newTargetWeight = signal<number>(0);
    // Target Edit - Cardio
    newTargetDuration = signal<number>(0);
    newTargetDistance = signal<number>(0);
    newTargetResistance = signal<number>(0);


    // Log Set - Strength
    logWeight = signal<number>(0);
    logReps = signal<number>(0);
    logSets = signal<number>(1);
    logRir = signal<number | null>(null);
    // Log Set - Cardio
    logDuration = signal<number>(0);
    logDistance = signal<number>(0);
    logResistance = signal<number>(0);

    // --- Variant State ---
    variants = signal<any[]>([]);
    currentVariantIndex = signal<number>(0);
    showVariantModal = signal<boolean>(false);
    showVariantInfo = signal<boolean>(false);
    variantSearchQuery = signal<string>('');
    showCreateVariant = signal<boolean>(false);
    customVariantName = signal<string>('');
    exerciseSearchResults = signal<any[]>([]);
    routineExercises = signal<any[]>([]); // Exercises from the same routine

    // Navigation tracking
    previousUrl = signal<string | null>(null);

    // Delete confirmation modals
    showDeleteSetModal = signal<boolean>(false);
    setToDelete = signal<any>(null);
    showDeleteImageModal = signal<boolean>(false);
    imageToDelete = signal<number | null>(null);

    // Fullscreen image modal
    showFullscreenImage = signal<boolean>(false);

    // All exercise versions (parent + variants) for swipe navigation
    allVersions = computed(() => {
        const family = this.exerciseFamily();
        if (!family) {
            const ex = this.exercise();
            return ex ? [ex] : [];
        }

        const versions = [family];
        if (family.variants && family.variants.length > 0) {
            versions.push(...family.variants);
        }
        return versions;
    });

    // Current active exercise (could be parent or variant)
    activeExercise = computed(() => {
        const versions = this.allVersions();
        const index = this.currentVariantIndex();
        return versions[index] || versions[0] || null;
    });

    // --- Carousel / Swipe State ---
    swipeOffsetMap = signal<Map<number, number>>(new Map()); // id -> offset
    isSwiping = signal<boolean>(false);

    private touchStartX = 0;
    private currentTouchX = 0;
    private readonly SWIPE_THRESHOLD = 50;

    onTouchStart(event: TouchEvent) {
        this.touchStartX = event.touches[0].clientX;
        this.currentTouchX = this.touchStartX;
        this.isSwiping.set(true);
    }

    onTouchMove(event: TouchEvent) {
        this.currentTouchX = event.touches[0].clientX;
        let diff = this.currentTouchX - this.touchStartX;

        const versions = this.allVersions();
        const currentIndex = this.currentVariantIndex();
        const isFirst = currentIndex === 0;
        const isLast = currentIndex === (versions.length - 1);

        // Resistance
        if ((isFirst && diff > 0) || (isLast && diff < 0)) {
            diff = diff * 0.3;
        }

        // We use a specific ID (e.g. 999) for the detail view carousel
        this.swipeOffsetMap.update(map => {
            const newMap = new Map(map);
            newMap.set(999, diff);
            return newMap;
        });
    }

    onTouchEnd(event: TouchEvent) {
        this.isSwiping.set(false);
        const diff = this.currentTouchX - this.touchStartX;

        const versions = this.allVersions();
        const currentIndex = this.currentVariantIndex();
        const isFirst = currentIndex === 0;
        const isLast = currentIndex === (versions.length - 1);

        if (Math.abs(diff) > this.SWIPE_THRESHOLD) {
            const direction = diff > 0 ? -1 : 1; // Drag right -> Prev

            if (!((isFirst && direction === -1) || (isLast && direction === 1))) {
                const newIndex = currentIndex + direction;
                if (newIndex >= 0 && newIndex < versions.length) {
                    this.goToVariant(newIndex);
                }
            }
        }

        // Reset offset
        this.swipeOffsetMap.update(map => {
            const newMap = new Map(map);
            newMap.set(999, 0);
            return newMap;
        });
    }

    getTransform(): string {
        const baseOffset = -(this.currentVariantIndex() || 0) * 100;
        const pixelOffset = this.swipeOffsetMap().get(999) || 0;
        return `translateX(calc(${baseOffset}% + ${pixelOffset}px))`;
    }

    goToVariant(index: number): void {
        this.currentVariantIndex.set(index);
        const variants = this.allVersions();
        const nextVariant = variants[index];
        if (nextVariant && nextVariant.id !== this.exercise()?.id) {
            // Load silently so the page doesn't blink
            const slug = nextVariant.url_slug || nextVariant.id;
            this.loadExercise(slug, true);
            this.location.replaceState(`/workouts/exercise/${slug}`);
        }
    }

    // Filtered routine exercises for variant suggestions
    filteredRoutineExercises = computed(() => {
        const query = this.variantSearchQuery().toLowerCase();
        const currentExId = this.exercise()?.exercise_detail?.id;

        return this.routineExercises()
            .filter((ex: any) => {
                // Exclude current exercise
                if (ex.exercise_detail?.id === currentExId) return false;
                // Filter by search query
                if (query.length >= 2) {
                    return ex.exercise_detail?.name?.toLowerCase().includes(query);
                }
                return true;
            })
            .slice(0, 10); // Limit to 10 suggestions
    });

    // --- Chart Configuration ---
    chartType: ChartType = 'line';

    // Chart data computed from history
    weightChartData = computed<ChartConfiguration['data']>(() => {
        const history = this.recentHistory();
        const isCardio = this.exercise()?.is_cardio || false;

        if (history.length === 0) {
            return { labels: [], datasets: [] };
        }

        // Sort by date ascending for chart display
        const sorted = [...history].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Extract labels
        const labels = sorted.map(item => this.formatChartDate(item.date));

        if (isCardio) {
            // For cardio: two datasets - distance (green) and resistance (orange)
            const distances = sorted.map(item => +(item.distance_km || 0));
            const resistances = sorted.map(item => +(item.resistance || 0));

            return {
                labels,
                datasets: [
                    {
                        data: distances,
                        label: 'Distancia (km)',
                        borderColor: '#13ec6a',
                        backgroundColor: 'rgba(19, 236, 106, 0.15)',
                        pointBackgroundColor: '#13ec6a',
                        pointBorderColor: '#102217',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y'
                    },
                    {
                        data: resistances,
                        label: 'Resistencia',
                        borderColor: '#f97316',
                        backgroundColor: 'rgba(249, 115, 22, 0.15)',
                        pointBackgroundColor: '#f97316',
                        pointBorderColor: '#102217',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y1'
                    }
                ]
            };
        } else {
            // For strength: single dataset for weight
            const weights = sorted.map(item => item.weight);

            return {
                labels,
                datasets: [{
                    data: weights,
                    label: 'Peso (kg)',
                    borderColor: '#13ec6a',
                    backgroundColor: 'rgba(19, 236, 106, 0.15)',
                    pointBackgroundColor: '#13ec6a',
                    pointBorderColor: '#102217',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    fill: true
                }]
            };
        }
    });

    chartOptions: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: true, position: 'top', labels: { color: '#64748b', font: { size: 10 } } },
            tooltip: {
                backgroundColor: '#1d3627',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: '#13ec6a',
                borderWidth: 1,
                padding: 12,
                displayColors: true,
                callbacks: {
                    label: (context) => {
                        const label = context.dataset.label || '';
                        let unit = '';
                        if (label.includes('km')) unit = 'km';
                        else if (label.includes('Resistencia')) unit = '';
                        else unit = 'kg';
                        return `${label}: ${context.parsed.y}${unit ? ' ' + unit : ''}`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#64748b', font: { size: 11, weight: 'bold' } },
                border: { display: false }
            },
            y: {
                type: 'linear',
                position: 'left',
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#13ec6a', font: { size: 11 } },
                border: { display: false },
                beginAtZero: false
            },
            y1: {
                type: 'linear',
                position: 'right',
                grid: { display: false },
                ticks: { color: '#f97316', font: { size: 11 } },
                border: { display: false },
                beginAtZero: true
            }
        },
        interaction: {
            intersect: false,
            mode: 'index'
        }
    };

    // Helper to format dates for chart labels
    private formatChartDate(dateStr: string): string {
        const date = new Date(dateStr);
        const day = date.getDate();
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${day} ${months[date.getMonth()]}`;
    }

    ngOnInit(): void {
        const exerciseSlug = this.route.snapshot.paramMap.get('slug');

        // Read previous URL from sessionStorage instead of query params
        const previousUrl = this.navHistory.peekPreviousUrl();
        if (previousUrl) {
            this.previousUrl.set(previousUrl);
        }

        if (exerciseSlug) {
            this.loadExercise(exerciseSlug);
        }
    }

    loadExercise(idOrSlug: number | string, silent: boolean = false): void {
        if (!silent) {
            this.loading.set(true);
        }
        this.error.set(null);

        this.api.getRoutineExercise(idOrSlug).subscribe({
            next: (data: RoutineExercise) => {
                this.exercise.set(data);
                this.updateDisplayValues(data);

                // Handle Family / All Versions Logic
                const currentFamily = this.exerciseFamily();

                // Case 1: Is Child
                if (data.variant_of) {
                    // Check if we already have the parent loaded
                    if (currentFamily?.id === data.variant_of) {
                        // Already have family, just sync index
                        this.syncVariantIndex(data.id);
                    } else {
                        // Fetch parent to get family
                        this.api.getRoutineExercise(data.variant_of).subscribe(parent => {
                            this.exerciseFamily.set(parent);
                            this.syncVariantIndex(data.id);
                        });
                    }
                }
                // Case 2: Is Parent
                else {
                    this.exerciseFamily.set(data);
                    this.syncVariantIndex(data.id);
                }

                // Load individual sets
                this.loadSets(data.id);
                if (!silent) {
                    this.loading.set(false);
                }
            },
            error: (err) => {
                console.error('Error loading exercise:', err);
                this.error.set('Error al cargar el ejercicio');
                this.loading.set(false);
            }
        });
    }

    private syncVariantIndex(currentId: number): void {
        const versions = this.allVersions();
        const index = versions.findIndex(v => v.id === currentId);
        if (index >= 0) {
            this.currentVariantIndex.set(index);
        }
    }

    private updateDisplayValues(data: RoutineExercise): void {
        this.targetSets.set(data.target_sets);
        this.targetReps.set(data.target_reps.toString());
        this.targetWeight.set(data.target_weight);

        // Initialize edit target inputs
        this.newTargetSets.set(data.target_sets);
        this.newTargetReps.set(data.target_reps.toString());
        this.newTargetWeight.set(data.target_weight);

        // Load images
        const media = data.exercise_detail?.media || [];
        const images = media
            .filter((m: any) => m.media_type === 'image')
            .map((m: any) => ({ id: m.id, url: m.file_url || m.file }));
        this.exerciseImages.set(images);
        this.initializeCarousel();
    }

    loadSets(id: number): void {
        this.weightChartLoading.set(true); // Ensure loading state starts

        this.api.getExerciseSets(id).subscribe({
            next: (sets: any) => {
                // Handle paginated or list response
                let setsArray: any[] = [];
                if (Array.isArray(sets)) {
                    setsArray = sets;
                } else if (sets.results && Array.isArray(sets.results)) {
                    setsArray = sets.results;
                }

                // Group sets by date descending
                const sorted = setsArray.sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());

                // Group consecutive sets with same date, weight, reps (for strength) or just by date (for cardio)
                const isCardio = this.exercise()?.is_cardio || false;
                const groupedHistory: any[] = [];

                setsArray.forEach(set => {
                    const date = new Date(set.performed_at).toDateString();
                    const lastGroup = groupedHistory[groupedHistory.length - 1];

                    let isSameGroup = false;
                    if (!isCardio) {
                        // For strength, group by same date, weight, reps
                        isSameGroup = lastGroup &&
                            new Date(lastGroup.date).toDateString() === date &&
                            lastGroup.weight === set.weight &&
                            lastGroup.reps === set.reps &&
                            lastGroup.rir === set.rir;
                    }
                    // For cardio, don't group - each session is separate

                    if (isSameGroup && !isCardio) {
                        lastGroup.setsCount++;
                        lastGroup.ids.push(set.id);
                    } else {
                        groupedHistory.push({
                            id: set.id,
                            ids: [set.id],
                            date: set.performed_at,
                            weight: set.weight,
                            exerciseIcon: this.exercise()?.icon || (isCardio ? 'directions_run' : 'fitness_center'),
                            reps: set.reps,
                            rir: set.rir,
                            setsCount: 1,
                            // Cardio fields
                            duration_minutes: set.duration_minutes || 0,
                            distance_km: set.distance_km || 0,
                            resistance: set.resistance || 0
                        });
                    }
                });

                this.recentHistory.set(groupedHistory);

                // Calculate progress stats from sets
                if (groupedHistory.length > 0) {
                    if (isCardio) {
                        // Cardio stats - use last recorded values
                        const lastSession = groupedHistory[0]; // Most recent
                        this.lastCardioDistance.set(lastSession.distance_km || 0);
                        this.lastCardioDuration.set(lastSession.duration_minutes || 0);

                        // Calculate progress based on distance
                        const sortedByDate = [...groupedHistory].sort((a, b) =>
                            new Date(a.date).getTime() - new Date(b.date).getTime()
                        );
                        const firstDistance = sortedByDate[0].distance_km || 0;
                        const lastDistance = sortedByDate[sortedByDate.length - 1].distance_km || 0;

                        if (firstDistance > 0) {
                            const percent = Math.round(((lastDistance - firstDistance) / firstDistance) * 100);
                            this.progressPercent.set(percent);
                        } else {
                            this.progressPercent.set(0);
                        }
                    } else {
                        // Strength stats
                        const maxWeight = Math.max(...groupedHistory.map((s: any) => s.weight || 0));
                        this.currentMaxWeight.set(maxWeight);

                        // Calculate progress percentage (compare first to last entry chronologically)
                        const sortedByDate = [...groupedHistory].sort((a, b) =>
                            new Date(a.date).getTime() - new Date(b.date).getTime()
                        );
                        const firstWeight = sortedByDate[0].weight || 0;
                        const lastWeight = sortedByDate[sortedByDate.length - 1].weight || 0;

                        if (firstWeight > 0) {
                            const percent = Math.round(((lastWeight - firstWeight) / firstWeight) * 100);
                            this.progressPercent.set(percent);
                        } else {
                            this.progressPercent.set(0);
                        }
                    }
                } else {
                    // Reset stats if no history for this variant
                    this.currentMaxWeight.set(0);
                    this.lastCardioDistance.set(0);
                    this.lastCardioDuration.set(0);
                    this.progressPercent.set(0);
                }

                this.loading.set(false);
                this.weightChartLoading.set(false); // Enable chart display
            },
            error: (err) => {
                console.error('Error loading sets:', err);
                this.loading.set(false);
                this.weightChartLoading.set(false);
            }
        });
    }

    deleteSet(item: any): void {
        this.setToDelete.set(item);
        this.showDeleteSetModal.set(true);
    }

    confirmDeleteSet(): void {
        const item = this.setToDelete();
        if (!item) return;

        const requests = item.ids.map((id: number) => this.api.deleteExerciseSet(id));
        forkJoin(requests).subscribe({
            next: () => {
                const ex = this.exercise();
                if (ex) this.loadSets(ex.id);
                this.showDeleteSetModal.set(false);
                this.setToDelete.set(null);
            },
            error: (err) => console.error('Error deleting set(s)', err)
        });
    }

    cancelDeleteSet(): void {
        this.showDeleteSetModal.set(false);
        this.setToDelete.set(null);
    }

    // ... (keep formatDate, goBack)

    formatDate(dateStr: string): string {
        const date = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()} `;
    }

    goBack(): void {
        const prevUrl = this.previousUrl();
        if (prevUrl) {
            // Navigate explicitly to the previous URL
            this.router.navigateByUrl(prevUrl);
        } else {
            // Fallback to default workout list
            this.router.navigate(['/workouts']);
        }
    }

    // --- Target Editing ---

    editTarget(): void {
        const ex = this.exercise();
        if (ex) {
            if (ex.is_cardio) {
                // Initialize cardio fields
                this.newTargetDuration.set(ex.target_duration_minutes || 0);
                this.newTargetDistance.set(ex.target_distance_km || 0);
                this.newTargetResistance.set(ex.target_resistance || 0);
            } else {
                // Initialize strength fields
                this.newTargetSets.set(ex.target_sets);
                this.newTargetReps.set(ex.target_reps.toString());
                this.newTargetWeight.set(ex.target_weight);
            }
            this.showTargetModal.set(true);
        }
    }

    closeTargetModal(): void {
        this.showTargetModal.set(false);
    }

    saveTarget(): void {
        const ex = this.exercise();
        if (!ex) return;

        this.isSaving.set(true);
        let data: any;

        if (ex.is_cardio) {
            data = {
                target_duration_minutes: this.newTargetDuration(),
                target_distance_km: this.newTargetDistance(),
                target_resistance: this.newTargetResistance()
            };
        } else {
            data = {
                target_sets: this.newTargetSets(),
                target_reps: this.newTargetReps(),
                target_weight: this.newTargetWeight()
            };
        }

        this.api.updateRoutineExercise(ex.id, data).subscribe({
            next: (updated) => {
                // 1. Update current exercise signal
                this.exercise.set(updated);

                // 2. Update display signals
                this.targetSets.set(updated.target_sets);
                this.targetReps.set(updated.target_reps.toString());
                this.targetWeight.set(updated.target_weight);

                // 3. Update Family/AllVersions so Carousel updates immediately
                const currentFamily = this.exerciseFamily();
                if (currentFamily) {
                    // Deep copy or structured clone if needed, but simple obj spread works for signal update trigger
                    if (currentFamily.id === updated.id) {
                        // Updated the parent itself
                        this.exerciseFamily.set({ ...currentFamily, ...updated });
                    } else if (currentFamily.variants) {
                        // Updated a variant
                        const updatedVariants = currentFamily.variants.map(v =>
                            v.id === updated.id ? { ...v, ...updated } : v
                        );
                        this.exerciseFamily.set({ ...currentFamily, variants: updatedVariants });
                    }
                }

                this.isSaving.set(false);
                this.closeTargetModal();
            },
            error: (err) => {
                console.error('Error updating target', err);
                this.isSaving.set(false);
            }
        });
    }

    // --- Log Set ---

    logNewSet(): void {
        const ex = this.exercise();
        if (ex?.is_cardio) {
            // Initialize cardio values from exercise targets (ensure they're numbers)
            this.logDuration.set(+(ex.target_duration_minutes || 0));
            this.logDistance.set(+(ex.target_distance_km || 0));
            this.logResistance.set(+(ex.target_resistance || 0));
        } else {
            // Pre-fill with strength targets
            this.logWeight.set(this.targetWeight());
            // Parse reps if range
            const reps = parseInt(this.targetReps().split('-')[0]) || 0;
            this.logReps.set(reps);
            this.logSets.set(this.targetSets());
            this.logRir.set(null);
        }
        this.showLogModal.set(true);
    }

    closeLogModal(): void {
        this.showLogModal.set(false);
    }

    // Weight helpers for template
    incrementWeight(): void {
        this.logWeight.set(Number(this.logWeight()) + 2.5);
    }

    decrementWeight(): void {
        this.logWeight.set(Math.max(0, Number(this.logWeight()) - 2.5));
    }

    updateWeight(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.logWeight.set(parseFloat(value) || 0);
    }

    saveLog(): void {
        const ex = this.exercise();
        if (!ex) return;

        this.isSaving.set(true);
        const formData = new FormData();
        formData.append('routine_exercise', ex.id.toString());

        if (ex.is_cardio) {
            // Cardio data - save a single session
            formData.append('duration_minutes', this.logDuration().toString());
            formData.append('distance_km', this.logDistance().toString());
            formData.append('resistance', this.logResistance().toString());
        } else {
            // Strength data - save multiple sets if needed
            formData.append('weight', this.logWeight().toString());
            formData.append('reps', this.logReps().toString());
            if (this.logRir() !== null) {
                formData.append('rir', this.logRir()!.toString());
            }
        }

        // For cardio, we save a single session; for strength, we may save multiple sets
        const requests = [];
        const count = ex.is_cardio ? 1 : this.logSets();
        for (let i = 0; i < count; i++) {
            requests.push(this.api.createExerciseSet(formData));
        }

        forkJoin(requests).subscribe({
            next: () => {
                this.isSaving.set(false);
                this.closeLogModal();
                // Reload progress/history
                this.loadSets(ex.id);
            },
            error: (err) => {
                console.error('Error logging set', err);
                this.isSaving.set(false);
            }
        });
    }

    // --- Existing Edit Methods ---
    // (Ensure updateEditName, onFileSelected, deleteImageConfirm, saveChanges... are kept)

    toggleEdit(): void {
        const ex = this.exercise();
        if (ex && ex.routine_url_slug && ex.routine_day_url_slug) {
            // Store return URL in sessionStorage instead of query params
            this.navHistory.setReturnUrl(`/workouts/exercise/${ex.url_slug}`);
            // Keep previous URL for the return journey

            this.router.navigate(
                ['/workouts/routine', ex.routine_url_slug, 'day', ex.routine_day_url_slug, 'exercise', ex.url_slug, 'edit'],
                { replaceUrl: true }
            );
        }
    }

    updateEditName(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.editName.set(input.value);
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const files = Array.from(input.files);
            const exerciseId = this.exercise()?.exercise_detail?.id;

            if (exerciseId) {
                this.api.uploadExerciseImages(exerciseId, files).subscribe({
                    next: (response) => {
                        this.loadExercise(this.exercise()!.id);
                    },
                    error: (err) => {
                        console.error('Error uploading images', err);
                    }
                });
            }
        }
        input.value = '';
    }

    deleteImageConfirm(mediaId: number): void {
        this.imageToDelete.set(mediaId);
        this.showDeleteImageModal.set(true);
    }

    confirmDeleteImage(): void {
        const mediaId = this.imageToDelete();
        const exerciseId = this.exercise()?.exercise_detail?.id;
        if (exerciseId && mediaId) {
            this.api.deleteExerciseImage(exerciseId, mediaId).subscribe({
                next: () => {
                    this.exerciseImages.update(imgs => imgs.filter(img => img.id !== mediaId));
                    this.initializeCarousel();
                    this.showDeleteImageModal.set(false);
                    this.imageToDelete.set(null);
                },
                error: (err) => console.error('Error deleting image', err)
            });
        }
    }

    cancelDeleteImage(): void {
        this.showDeleteImageModal.set(false);
        this.imageToDelete.set(null);
    }

    saveChanges(): void {
        if (!this.editName().trim()) return;

        const exerciseId = this.exercise()?.exercise_detail?.id; // Corrected: update the exercise detail name, not routine exercise name?
        // RoutineExercise has a name property? No, it delegates to ExerciseDetail.
        // But invalidation might be tricky.
        // api.updateExercise updates the Library Exercise name.

        const currentName = this.exercise()?.exercise_detail?.name;
        const newName = this.editName().trim();

        if (exerciseId) {
            this.isSaving.set(true);
            if (newName !== currentName) {
                this.api.updateExercise(exerciseId, { name: newName }).subscribe({
                    next: () => {
                        this.isSaving.set(false);
                        this.isEditing.set(false);
                        this.loadExercise(this.exercise()!.id);
                    },
                    error: (err) => {
                        console.error('Error updating name', err);
                        this.isSaving.set(false);
                    }
                });
            } else {
                this.isSaving.set(false);
                this.isEditing.set(false);
            }
        }
    }

    // Carousel navigation - Infinite loop implementation
    isImageWrapAround = signal<boolean>(false);
    virtualImageIndex = signal<number>(1); // Start at 1 because of clone at beginning

    // Computed: Images with clones for infinite effect
    infiniteImages = computed(() => {
        const images = this.exerciseImages();
        if (images.length <= 1) return images;

        // Add last image at beginning and first image at end
        return [
            images[images.length - 1], // Clone of last
            ...images,                  // Original images
            images[0]                   // Clone of first
        ];
    });

    // Computed: Real current index (without clones)
    realImageIndex = computed(() => {
        const virtual = this.virtualImageIndex();
        const length = this.exerciseImages().length;
        if (length <= 1) return 0;

        if (virtual === 0) return length - 1;
        if (virtual === length + 1) return 0;
        return virtual - 1;
    });

    // Initialize virtual index when images change
    initializeCarousel(): void {
        const images = this.exerciseImages();
        if (images.length > 1) {
            this.virtualImageIndex.set(1);
        } else {
            this.virtualImageIndex.set(0);
        }
    }

    nextImage(): void {
        const images = this.exerciseImages();
        if (images.length <= 1) return;

        const current = this.virtualImageIndex();
        const newIndex = current + 1;

        this.isImageWrapAround.set(false);
        this.virtualImageIndex.set(newIndex);

        // If we're now at the clone of first, jump to real first after animation
        if (newIndex === images.length + 1) {
            setTimeout(() => {
                this.isImageWrapAround.set(true);
                this.virtualImageIndex.set(1);
                setTimeout(() => this.isImageWrapAround.set(false), 50);
            }, 350); // Wait for animation to complete
        }
    }

    prevImage(): void {
        const images = this.exerciseImages();
        if (images.length <= 1) return;

        const current = this.virtualImageIndex();
        const newIndex = current - 1;

        this.isImageWrapAround.set(false);
        this.virtualImageIndex.set(newIndex);

        // If we're now at the clone of last, jump to real last after animation
        if (newIndex === 0) {
            setTimeout(() => {
                this.isImageWrapAround.set(true);
                this.virtualImageIndex.set(images.length);
                setTimeout(() => this.isImageWrapAround.set(false), 50);
            }, 350); // Wait for animation to complete
        }
    }

    goToImage(index: number): void {
        // index is the real index (0-based without clones)
        this.virtualImageIndex.set(index + 1);
    }

    // --- Variant Navigation ---

    // Original GoToVariant logic removed (handled by new slider logic)

    // --- Add Variant Modal ---
    openVariantModal(): void {
        this.variantSearchQuery.set('');
        this.showVariantModal.set(true);
        this.loadRoutineExercises();
    }

    loadRoutineExercises(): void {
        const ex = this.exercise();
        if (!ex?.routine_id) return;

        // Load all exercises from this routine directly
        this.api.getRoutine(ex.routine_id).subscribe({
            next: (routine: any) => {
                const allExercises: any[] = [];
                if (routine?.days) {
                    routine.days.forEach((d: any) => {
                        const dayExercises = d.routine_exercises || d.exercises || [];
                        dayExercises.forEach((exercise: any) => {
                            allExercises.push({
                                ...exercise,
                                dayName: d.title || d.day_label
                            });
                            // Also add variants
                            if (exercise.variants) {
                                exercise.variants.forEach((v: any) => {
                                    allExercises.push({
                                        ...v,
                                        dayName: d.title || d.day_label,
                                        isVariant: true
                                    });
                                });
                            }
                        });
                    });
                }
                this.routineExercises.set(allExercises);
            }
        });
    }

    closeVariantModal(): void {
        this.showVariantModal.set(false);
        this.showCreateVariant.set(false);
        this.customVariantName.set('');
        this.variantSearchQuery.set('');
        this.exerciseSearchResults.set([]);
    }

    openAddExerciseForVariant(): void {
        const ex = this.exercise();
        if (!ex?.routine_url_slug || !ex?.routine_day_url_slug) return;

        this.closeVariantModal();
        // Navigate to add-exercise with variant parent info
        this.router.navigate(['/workouts/routine', ex.routine_url_slug, 'day', ex.routine_day_url_slug, 'add-exercise'], {
            queryParams: {
                variantParentId: ex.id,
                variantParentName: ex.exercise_detail?.name,
                variantParentSlug: ex.url_slug
            }
        });
    }

    toggleVariantInfo(): void {
        this.showVariantInfo.update(v => !v);
    }

    addVariant(exerciseId: number): void {
        const ex = this.exercise();
        if (!ex) return;

        const data = {
            exercise: exerciseId,
            target_sets: ex.target_sets,
            target_reps: ex.target_reps,
            target_weight: ex.target_weight
        };

        this.isSaving.set(true);
        this.api.addExerciseVariant(ex.id, data).subscribe({
            next: () => {
                this.isSaving.set(false);
                this.closeVariantModal();
                // Reload exercise to get updated variants
                this.loadExercise(ex.id);
            },
            error: (err) => {
                console.error('Error adding variant', err);
                this.isSaving.set(false);
            }
        });
    }

    setActiveVariant(variantId: number): void {
        this.isSaving.set(true);
        this.api.setActiveVariant(variantId).subscribe({
            next: () => {
                this.isSaving.set(false);
                const ex = this.exercise();
                if (ex) this.loadExercise(ex.id);
            },
            error: (err) => {
                console.error('Error setting active variant', err);
                this.isSaving.set(false);
            }
        });
    }

    // Toggle create variant mode
    toggleCreateVariant(): void {
        this.showCreateVariant.update(v => !v);
        if (this.showCreateVariant()) {
            this.customVariantName.set('');
        }
    }

    // Search exercises in real-time
    searchExercises(): void {
        const query = this.variantSearchQuery();
        if (query.length < 2) {
            this.exerciseSearchResults.set([]);
            return;
        }
        this.api.searchExercises(query).subscribe({
            next: (results) => this.exerciseSearchResults.set(results || []),
            error: () => this.exerciseSearchResults.set([])
        });
    }

    // Create variant from custom name
    createCustomVariant(): void {
        const name = this.customVariantName().trim();
        if (!name) return;

        const ex = this.exercise();
        if (!ex) return;

        this.isSaving.set(true);

        // First create/get the exercise
        this.api.getOrCreateExercise({
            name: name,
            description: '',
            default_sets: ex.target_sets,
            default_reps: ex.target_reps,
            default_weight: ex.target_weight
        }).subscribe({
            next: (response) => {
                const exerciseId = response.exercise?.id;
                if (exerciseId) {
                    // Now add as variant
                    this.addVariant(exerciseId);
                } else {
                    this.isSaving.set(false);
                }
            },
            error: (err) => {
                console.error('Error creating exercise', err);
                this.isSaving.set(false);
            }
        });
    }

    // --- Fullscreen Image Swipe ---
    private fullscreenTouchStartX = 0;
    fullscreenDragOffset = signal<number>(0);
    private fullscreenIsDragging = false;

    getFullscreenTransform(): string {
        const baseOffset = -(this.virtualImageIndex()) * 100;
        const pixelOffset = this.fullscreenDragOffset();
        return `translateX(calc(${baseOffset}% + ${pixelOffset}px))`;
    }

    onFullscreenTouchStart(event: TouchEvent): void {
        this.fullscreenTouchStartX = event.touches[0].clientX;
        this.fullscreenDragOffset.set(0);
        this.fullscreenIsDragging = true;
    }

    onFullscreenTouchMove(event: TouchEvent): void {
        if (!this.fullscreenIsDragging) return;
        const currentX = event.touches[0].clientX;
        const diff = currentX - this.fullscreenTouchStartX;
        this.fullscreenDragOffset.set(diff);
    }

    onFullscreenTouchEnd(event: TouchEvent): void {
        if (!this.fullscreenIsDragging) return;
        this.fullscreenIsDragging = false;

        const offset = this.fullscreenDragOffset();
        const threshold = 50; // minimum swipe distance

        if (Math.abs(offset) > threshold) {
            if (offset < 0) {
                // Swipe left - next image
                this.nextImage();
            } else {
                // Swipe right - prev image
                this.prevImage();
            }
        }

        // Reset offset with animation
        this.fullscreenDragOffset.set(0);
    }
}
