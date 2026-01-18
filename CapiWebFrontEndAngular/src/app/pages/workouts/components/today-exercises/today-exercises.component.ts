import { Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { NavigationHistoryService } from '../../../../services/navigation-history.service';
import { Routine, RoutineDay, RoutineExercise } from '../../../../models/workouts';
import { MotivationService } from '../../../../services/motivation';

interface ExerciseGroup {
    parent: RoutineExercise;
    active: RoutineExercise;
    versions: RoutineExercise[];
    activeIndex?: number;
    hasVariants: boolean;
    isCompleted: boolean;
    isActive: boolean; // Is this the current focus in the workout flow
    animationClass?: string;
}

@Component({
    selector: 'app-today-exercises',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './today-exercises.component.html',
    styleUrls: [],
    styles: [`:host { display: block; }`]
})
export class TodayExercisesComponent implements OnInit, OnDestroy {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private navHistory = inject(NavigationHistoryService);
    private motivationService = inject(MotivationService);

    routineSlug = signal<string | null>(null);
    daySlug = signal<string | null>(null);
    dayTitle = signal<string>('Workout');

    // Changed to hold groups
    exercises = signal<ExerciseGroup[]>([]);

    loading = signal<boolean>(true);
    error = signal<string | null>(null);

    // Timer
    hours = signal<number>(0);
    minutes = signal<number>(0);
    seconds = signal<number>(0);
    private timerInterval: any;
    private startTime: number = 0;

    // Progress
    completedCount = signal<number>(0);
    totalCount = signal<number>(0);
    progressPercent = signal<number>(0);
    private hasShownCompletionMotivation = false;

    ngOnInit(): void {
        const routineSlugParam = this.route.snapshot.paramMap.get('routineSlug');
        const daySlugParam = this.route.snapshot.paramMap.get('daySlug');

        if (routineSlugParam) this.routineSlug.set(routineSlugParam);
        if (daySlugParam) this.daySlug.set(daySlugParam);

        this.loadExercises();
        this.startTimer();
    }

    ngOnDestroy(): void {
        this.stopTimer();
    }

    loadExercises(): void {
        this.loading.set(true);
        this.error.set(null);

        const rSlug = this.routineSlug();
        if (!rSlug) {
            this.error.set('Routine slug not found');
            this.loading.set(false);
            return;
        }

        this.api.getRoutine(rSlug).subscribe({
            next: (routine: Routine) => {
                const dSlug = this.daySlug();
                // Match by short_id (robust) or exact url_slug
                const day = routine.days?.find(d =>
                    d.url_slug === dSlug || (d.short_id && dSlug?.startsWith(d.short_id + '-'))
                );

                if (day) {
                    this.dayTitle.set(day.title || day.day_label || 'Workout');

                    if (day.routine_exercises) {
                        // 1. Filter parents
                        const parents = day.routine_exercises.filter(ex => !ex.variant_of);

                        // 2. Map to groups
                        const groups: ExerciseGroup[] = parents.map((parent, idx) => {
                            const versions = [parent, ...(parent.variants || [])];
                            let activeVersion = parent;

                            // Default active: check is_active_variant
                            if (parent.variants && parent.variants.length > 0) {
                                const activeVariant = parent.variants.find((v: any) => v.is_active_variant);
                                if (activeVariant) {
                                    activeVersion = activeVariant;
                                }
                            }

                            // Determine active index
                            const activeIndex = versions.findIndex(v => v.id === activeVersion.id);

                            return {
                                parent: parent,
                                active: activeVersion,
                                activeIndex: activeIndex >= 0 ? activeIndex : 0,
                                versions: versions,
                                hasVariants: versions.length > 1,
                                isCompleted: false,
                                isActive: idx === 0, // First group active by default
                                animationClass: ''
                            };
                        });

                        this.exercises.set(groups);
                        this.updateProgress();
                    }
                }
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading exercises:', err);
                this.error.set('Error al cargar los ejercicios');
                this.loading.set(false);
            }
        });
    }

    startTimer(): void {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const totalSeconds = Math.floor(elapsed / 1000);
            this.hours.set(Math.floor(totalSeconds / 3600));
            this.minutes.set(Math.floor((totalSeconds % 3600) / 60));
            this.seconds.set(totalSeconds % 60);
        }, 1000);
    }

    stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }

    updateProgress(): void {
        const exercises = this.exercises();
        const completed = exercises.filter(e => e.isCompleted).length;
        const total = exercises.length;
        this.completedCount.set(completed);
        this.totalCount.set(total);
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        this.progressPercent.set(progress);

        if (progress >= 50 && !this.hasShownCompletionMotivation) {
            this.hasShownCompletionMotivation = true;
            this.motivationService.checkRoutineCompletion();
        }
    }

    toggleExercise(group: ExerciseGroup): void {
        const exercises = this.exercises();
        const index = exercises.findIndex(e => e.parent.id === group.parent.id);

        if (index >= 0) {
            const updated = [...exercises];
            // Toggle completion
            updated[index] = { ...updated[index], isCompleted: !updated[index].isCompleted };

            // Update active status - first incomplete exercise becomes active
            let foundActive = false;
            for (let i = 0; i < updated.length; i++) {
                if (!updated[i].isCompleted && !foundActive) {
                    updated[i] = { ...updated[i], isActive: true };
                    foundActive = true;
                } else {
                    updated[i] = { ...updated[i], isActive: false };
                }
            }

            this.exercises.set(updated);
            this.updateProgress();
        }
    }

    // Cycle variants (Swipe)
    cycleVariant(group: ExerciseGroup, direction: number): void {
        if (!group.hasVariants) return;

        const versions = group.versions;
        const currentIndex = versions.findIndex(v => v.id === group.active.id);

        const newIndex = (currentIndex + direction + versions.length) % versions.length;
        const newActive = versions[newIndex];

        // Anim class
        const animClass = direction > 0 ? 'animate-slide-next' : 'animate-slide-prev';

        // Update the group with animation
        this.exercises.update(currentGroups => {
            return currentGroups.map(g => {
                if (g.parent.id === group.parent.id) {
                    return { ...g, active: newActive, animationClass: animClass };
                }
                return g;
            });
        });

        // Reset animation class after timeout
        setTimeout(() => {
            this.exercises.update(currentGroups => {
                return currentGroups.map(g => {
                    if (g.parent.id === group.parent.id) {
                        return { ...g, animationClass: '' };
                    }
                    return g;
                });
            });
        }, 300);
    }

    // Track swipe offsets
    swipeOffsetMap = signal<Map<number, number>>(new Map());
    isSwipingMap = signal<Map<number, boolean>>(new Map());

    // Touch Handling Variables
    private touchStartX = 0;
    private currentTouchX = 0;
    private readonly SWIPE_THRESHOLD = 50;

    onTouchStart(event: TouchEvent, parentId: number) {
        this.touchStartX = event.touches[0].clientX;
        this.currentTouchX = this.touchStartX;

        this.isSwipingMap.update(map => {
            const newMap = new Map(map);
            newMap.set(parentId, true);
            return newMap;
        });
    }

    onTouchMove(event: TouchEvent, parentId: number) {
        this.currentTouchX = event.touches[0].clientX;
        let diff = this.currentTouchX - this.touchStartX;

        // Find group to check bounds
        const group = this.exercises().find(g => g.parent.id === parentId);
        if (group) {
            const isFirst = group.activeIndex === 0;
            const isLast = group.activeIndex === (group.versions.length - 1);

            // Add resistance at edges (rubber-banding)
            if ((isFirst && diff > 0) || (isLast && diff < 0)) {
                diff = diff * 0.3; // Much harder to pull
            }
        }

        this.swipeOffsetMap.update(map => {
            const newMap = new Map(map);
            newMap.set(parentId, diff);
            return newMap;
        });
    }

    onTouchEnd(event: TouchEvent, group: any) {
        this.isSwipingMap.update(map => {
            const newMap = new Map(map);
            newMap.set(group.parent.id, false);
            return newMap;
        });

        const diff = this.currentTouchX - this.touchStartX;
        const isFirst = group.activeIndex === 0;
        const isLast = group.activeIndex === (group.versions.length - 1);

        if (Math.abs(diff) > this.SWIPE_THRESHOLD) {
            const direction = diff > 0 ? -1 : 1;

            // Prevent cycle if at bounds
            if (!((isFirst && direction === -1) || (isLast && direction === 1))) {
                const newIndex = (group.activeIndex || 0) + direction;

                if (newIndex >= 0 && newIndex < group.versions.length) {
                    const newActive = group.versions[newIndex];

                    // Update active in signal
                    this.exercises.update(currentGroups => {
                        return currentGroups.map(g => {
                            if (g.parent.id === group.parent.id) {
                                return { ...g, active: newActive, activeIndex: newIndex };
                            }
                            return g;
                        });
                    });
                }
            }
        }

        // Reset offset
        this.swipeOffsetMap.update(map => {
            const newMap = new Map(map);
            newMap.set(group.parent.id, 0);
            return newMap;
        });
    }

    getTransform(group: any): string {
        const baseOffset = -(group.activeIndex || 0) * 100;
        const pixelOffset = this.swipeOffsetMap().get(group.parent.id) || 0;
        return `translateX(calc(${baseOffset}% + ${pixelOffset}px))`;
    }

    isSwiping(parentId: number): boolean {
        return this.isSwipingMap().get(parentId) || false;
    }
    getExerciseIcon(exercise: RoutineExercise): string {
        const name = exercise.exercise_detail?.name?.toLowerCase() || '';
        if (name.includes('cardio') || name.includes('run')) return 'monitor_heart';
        if (name.includes('press') || name.includes('raise')) return 'directions_run';
        if (name.includes('pushdown') || name.includes('dips')) return 'accessibility_new';
        return 'fitness_center';
    }

    formatWeight(weight: number): string {
        return weight > 0 ? `${weight}kg` : '';
    }

    formatExerciseInfo(exercise: RoutineExercise): string {
        if (exercise.note) return exercise.note;
        const parts = [];
        parts.push(`${exercise.target_sets} sets`);
        parts.push(`${exercise.target_reps} reps`);
        if (exercise.target_weight > 0) {
            parts.push(`${exercise.target_weight}kg`);
        }
        return parts.join(' • ');
    }

    goBack(): void {
        const rSlug = this.routineSlug();
        if (rSlug) {
            this.router.navigate(['/workouts/routine', rSlug]);
        } else {
            this.router.navigate(['/workouts']);
        }
    }

    openExerciseDetail(exercise: RoutineExercise): void {
        // Store previous URL in sessionStorage instead of query params
        this.navHistory.setPreviousUrl('/workouts');
        this.router.navigate(['/workouts/exercise', exercise.url_slug]);
    }

    finishWorkout(): void {
        this.stopTimer();
        // Could show completion modal or navigate to summary
        this.router.navigate(['/workouts']);
    }

    padZero(num: number): string {
        return num.toString().padStart(2, '0');
    }
}
