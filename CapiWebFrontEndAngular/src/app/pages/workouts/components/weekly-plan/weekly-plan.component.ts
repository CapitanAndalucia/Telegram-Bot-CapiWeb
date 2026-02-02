import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { NavigationHistoryService } from '../../../../services/navigation-history.service';
import { Routine, RoutineDay, RoutineExercise } from '../../../../models/workouts';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
    selector: 'app-weekly-plan',
    standalone: true,
    imports: [CommonModule, LoadingSpinnerComponent],
    templateUrl: './weekly-plan.component.html',
    styleUrls: [],
    styles: [`:host { display: block; }`]
})
export class WeeklyPlanComponent implements OnInit {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private navHistory = inject(NavigationHistoryService);

    routine = signal<Routine | null>(null);
    selectedDay = signal<RoutineDay | null>(null);

    @ViewChild('dayCarousel') dayCarousel!: ElementRef;

    // Note Modal State
    showNoteModal = signal<boolean>(false);
    selectedExerciseNote = signal<string>('');
    selectedExerciseName = signal<string>('');

    // Track manually selected variant IDs for each parent exercise
    activeVariantIdMap = signal<Map<number, number>>(new Map());

    // Track swipe offsets for direct manipulation during drag
    swipeOffsetMap = signal<Map<number, number>>(new Map());
    isSwipingMap = signal<Map<number, boolean>>(new Map());

    // Track loaded images for day cards
    dayImageLoaded = signal<Map<number, boolean>>(new Map());

    // Group exercises by variant (only show parents)
    groupedExercises = computed(() => {
        const day = this.selectedDay();
        if (!day || !day.routine_exercises) return [];

        const parents = day.routine_exercises.filter(ex => !ex.variant_of);

        return parents.map(parent => {
            const versions = [parent, ...(parent.variants || [])];

            // Determine active ID
            let activeId = parent.id;
            const manualMap = this.activeVariantIdMap();
            if (manualMap.has(parent.id)) {
                activeId = manualMap.get(parent.id)!;
            } else {
                if (parent.variants && parent.variants.length > 0) {
                    const activeVariant = parent.variants.find((v: any) => v.is_active_variant);
                    if (activeVariant) {
                        activeId = activeVariant.id;
                    }
                }
            }

            const activeIndex = versions.findIndex(v => v.id === activeId);
            // Fallback to 0 if not found
            const safeIndex = activeIndex >= 0 ? activeIndex : 0;

            return {
                parent: parent,
                versions: versions,
                activeIndex: safeIndex,
                active: versions[safeIndex],
                hasVariants: versions.length > 1
            };
        });
    });

    loading = signal<boolean>(true);
    error = signal<string | null>(null);

    // Touch Handling Variables
    private touchStartX = 0;
    private currentTouchX = 0;
    private readonly SWIPE_THRESHOLD = 50;

    // Touch handling for swipe cards
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
        const group = this.groupedExercises().find(g => g.parent.id === parentId);
        if (group) {
            const isFirst = group.activeIndex === 0;
            const isLast = group.activeIndex === (group.versions.length - 1);

            // Add resistance at edges (rubber-banding)
            if ((isFirst && diff > 0) || (isLast && diff < 0)) {
                diff = diff * 0.3; // Much harder to pull
            }
        }

        // Update offset for visual feedback
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

        // Identify direction
        // Only trigger if threshold met AND not swiping out of bounds against resistance
        if (Math.abs(diff) > this.SWIPE_THRESHOLD) {
            const direction = diff > 0 ? -1 : 1; // Drag right (pos diff) -> go prev (-1 index)

            // Prevent cycle if at bounds
            if (!((isFirst && direction === -1) || (isLast && direction === 1))) {
                this.cycleVariant(group.parent, direction);
            }
        }

        // Reset offset (will animate back or to new position)
        this.swipeOffsetMap.update(map => {
            const newMap = new Map(map);
            newMap.set(group.parent.id, 0);
            return newMap;
        });
    }

    // Placeholder images for days
    dayImages = [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDWN5-lNbm09-TLknLdocVP_uxQm5T4oF_9tz_aLpEyhI_I532O3w_qJsIoNrzxz2oq_3l-bEH60EEFM9b_tLawaJRkGmof_nzhJVAcRZTdRj33XqczGB2IRpz7cSq2p6elUc371f2lhZxOrs5KxhgrcuVtBNbWpqU6QwQtsKTn1RTNkMSRM9m33g1M3soS4yIa7O6zgQePm67y5gnHr6rjyf9WjRaHmHLJNLlmylliz5KgOayoY3QnsfUkiHnOjs22pb2yjvFpkDXH',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBTEWsAjEQH1oRjodNUGS6dDxqo_5Exoy1b1tlLBb9gmqKqcnx1vN0GZP1RGmn2t05zfGWbHXiUNt25gzhozZZ8Zvt8uoYj49pTl0jeuBsH4BA76ID2bVlR6sNTM-U8SA8ZFlNCYja4RFDnwTj2fqGOYtBiBL-4eQb2BQYx8psCsfhoLz177Codh0NMTzmatFq81auZbCLN_WlVtL57G7iPHctWjvpuxcCS1NmBpmwSIwbLJYH4P85feNnGtRRVA89knlfheEE7zIzH',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuB3BZV-TWcAjl8JL3DnrrjEDRchGsJfkQneKj_hboTpGb6egAxfKFFOxixqA1_af3PnpuZNZ-H8ExUopXPoI9wuPGLXTVI3h7DDMw2RiqiIEYfstt3ia6LJa4SkyiFWOa4KkjrZZVRgms04ryMX1AykpnWTO6Ety77pzIIixujaOwyc039nhrqmPzeG3o76rpwyoyZ8za6wuM_ygM20QW64wNQgqwrWNDPnrPTNmIEQRy43Wsa__cFfkf0sUtOY904o3IYB_xwYB52k',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBDuZABiJhf3qTtTx0RCdBOe9bnKX9av0oqRq6z3HLxcxHQz-m7MyuBhMRmfSviI-JlUMnEKuQyFcDrFk_kEIB-iXUqnutWrprHkFGMQtmJQG4zCVVhhMYHOy34uoHG459uHaStTgjPH6auMZ8uDxJnAuP3Jv_s7mELUEBtYhuuFMBAm_FkJCC4PHPxdcg9rlFqt4Gco82zhv3PwTq1A0DOrbCFSK3ru_4M154ZYBaO55BIiGd9pXHUtkQqu2hi0Ya2NQyGUeqqI-Zq'
    ];

    ngOnInit(): void {
        const routineSlug = this.route.snapshot.paramMap.get('slug');
        if (routineSlug) {
            this.loadRoutine(routineSlug);
        }
    }

    loadRoutine(slug: string): void {
        this.loading.set(true);
        this.error.set(null);

        this.api.getRoutine(slug).subscribe({
            next: (data: Routine) => {
                this.routine.set(data);

                // Select day from query param or default to first
                const daySlug = this.route.snapshot.queryParamMap.get('day');
                let dayToSelect = null;

                if (daySlug && data.days) {
                    dayToSelect = data.days.find(d => d.url_slug === daySlug);
                }

                if (!dayToSelect && data.days && data.days.length > 0) {
                    dayToSelect = data.days[0];
                }

                if (dayToSelect) {
                    this.selectedDay.set(dayToSelect);
                    // Ensure URL is in sync if falling back to default
                    if (!daySlug) {
                        this.updateUrlForDay(dayToSelect);
                    }
                    setTimeout(() => this.scrollToSelectedDay(), 100);
                }

                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading routine:', err);
                this.error.set('Error al cargar la rutina');
                this.loading.set(false);
            }
        });
    }

    private scrollToSelectedDay(): void {
        const day = this.selectedDay();
        if (!day || !this.dayCarousel) return;

        const dayElement = document.getElementById(`day-${day.id}`);
        if (dayElement) {
            const container = this.dayCarousel.nativeElement;
            const containerWidth = container.offsetWidth;
            const cardWidth = dayElement.offsetWidth;
            const cardLeft = dayElement.offsetLeft; // Relative to parent if parent is positioned, otherwise careful

            // Calculate center position:
            // The position we want the card to be at is (containerWidth / 2) - (cardWidth / 2)
            // So we need to scroll to cardLeft - targetPosition

            // For a horizontally scrolling flex container, offsetLeft is usually relative to the container content
            // However, offsetLeft is relative to offsetParent. 
            // Better to use getBoundingClientRect if things are complex, but let's try basic calculation first
            // assuming container is the offsetParent (which it might not be explicitly unless position relative).

            // Let's use scrollIntoView with inline: 'center' which handles it automatically mostly
            dayElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    getDayImage(index: number): string {
        return this.dayImages[index % this.dayImages.length];
    }

    onDayImageLoad(dayId: number): void {
        this.dayImageLoaded.update(map => {
            const newMap = new Map(map);
            newMap.set(dayId, true);
            return newMap;
        });
    }

    selectDay(day: RoutineDay): void {
        this.selectedDay.set(day);
        this.updateUrlForDay(day);
    }

    private updateUrlForDay(day: RoutineDay): void {
        // Update URL without reloading to persist state in history
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { day: day.url_slug },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });
    }

    isToday(day: RoutineDay): boolean {
        const today = new Date().getDay();
        // JavaScript: 0=Sunday, 1=Monday... | Backend might use 0=Monday
        // Adjust if needed based on your backend
        const adjustedToday = today === 0 ? 6 : today - 1;
        return day.day_of_week === adjustedToday;
    }

    getDuration(day: RoutineDay): string {
        const exerciseCount = day.routine_exercises?.length || 0;
        const avgMinutesPerExercise = 10;
        return `${exerciseCount * avgMinutesPerExercise} Mins`;
    }

    getIntensity(day: RoutineDay): string {
        const exerciseCount = day.routine_exercises?.length || 0;
        if (exerciseCount >= 4) return 'High';
        if (exerciseCount >= 2) return 'Med';
        return 'Low';
    }

    getExerciseType(exercise: RoutineExercise): string {
        // Check cardio flag first
        if (exercise.is_cardio) {
            return 'Cardio';
        }
        const name = exercise.exercise_detail?.name?.toLowerCase() || '';
        if (name.includes('squat') || name.includes('deadlift') || name.includes('press') || name.includes('bench')) {
            return 'Compound';
        } else if (name.includes('dips') || name.includes('pull up') || name.includes('push')) {
            return 'Bodyweight';
        }
        return 'Fuerza';
    }

    getExerciseIcon(exercise: RoutineExercise): string {
        // Check cardio flag first
        if (exercise.is_cardio) {
            return 'directions_run';
        }
        const name = exercise.exercise_detail?.name?.toLowerCase() || '';
        if (name.includes('dips') || name.includes('pull')) return 'accessibility_new';
        if (name.includes('cable')) return 'cable';
        if (name.includes('run') || name.includes('cardio')) return 'directions_run';
        return 'fitness_center';
    }

    goBack(): void {
        this.router.navigate(['/workouts']);
    }

    startWorkout(): void {
        const day = this.selectedDay();
        const routine = this.routine();
        if (routine && day) {
            this.router.navigate(['/workouts/workout', routine.url_slug, day.url_slug]);
        }
    }

    viewExerciseDetail(exercise: RoutineExercise): void {
        const routine = this.routine();
        const day = this.selectedDay();

        let prevUrl = '/workouts';
        if (routine) {
            prevUrl = `/workouts/routine/${routine.url_slug}`;
            if (day) {
                prevUrl += `?day=${day.url_slug}`;
            }
        }

        // Store previous URL in sessionStorage instead of query params
        this.navHistory.setPreviousUrl(prevUrl);
        this.router.navigate(['/workouts/exercise', exercise.url_slug]);
    }

    openNoteModal(exercise: RoutineExercise, event: Event): void {
        event.stopPropagation();
        if (exercise.note) {
            this.selectedExerciseNote.set(exercise.note);
            this.selectedExerciseName.set(exercise.custom_name || exercise.exercise_detail.name);
            this.showNoteModal.set(true);
        }
    }

    closeNoteModal(): void {
        this.showNoteModal.set(false);
    }

    // --- Carousel Methods ---

    cycleVariant(parent: RoutineExercise, direction: number): void {
        const groupProp = this.groupedExercises().find(g => g.parent.id === parent.id);
        if (!groupProp || groupProp.versions.length <= 1) return;

        const versions = groupProp.versions;
        // activeIndex comes from computed signal mapping
        const newIndex = groupProp.activeIndex + direction;

        if (newIndex >= 0 && newIndex < versions.length) {
            const newVariant = versions[newIndex];
            this.activeVariantIdMap.update(map => {
                const newMap = new Map(map);
                newMap.set(parent.id, newVariant.id);
                return newMap;
            });
        }
    }

    getTransform(group: any): string {
        const baseOffset = -(group.activeIndex || 0) * 100; // Percent
        const pixelOffset = this.swipeOffsetMap().get(group.parent.id) || 0;
        return `translateX(calc(${baseOffset}% + ${pixelOffset}px))`;
    }

    isSwiping(parentId: number): boolean {
        return this.isSwipingMap().get(parentId) || false;
    }

    // --- Edit Methods ---

    toggleEdit(): void {
        const routine = this.routine();
        if (routine && routine.url_slug) {
            this.router.navigate(['/workouts/edit', routine.url_slug]);
        }
    }

    // End of Component
}
