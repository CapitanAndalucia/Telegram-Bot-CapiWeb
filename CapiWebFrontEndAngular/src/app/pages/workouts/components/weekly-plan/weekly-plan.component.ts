import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { Routine, RoutineDay, RoutineExercise } from '../../../../models/workouts';

@Component({
    selector: 'app-weekly-plan',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './weekly-plan.component.html',
    styleUrls: ['./weekly-plan.component.css']
})
export class WeeklyPlanComponent implements OnInit {
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    routine = signal<Routine | null>(null);
    selectedDay = signal<RoutineDay | null>(null);
    loading = signal<boolean>(true);
    error = signal<string | null>(null);

    // Placeholder images for days
    dayImages = [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDWN5-lNbm09-TLknLdocVP_uxQm5T4oF_9tz_aLpEyhI_I532O3w_qJsIoNrzxz2oq_3l-bEH60EEFM9b_tLawaJRkGmof_nzhJVAcRZTdRj33XqczGB2IRpz7cSq2p6elUc371f2lhZxOrs5KxhgrcuVtBNbWpqU6QwQtsKTn1RTNkMSRM9m33g1M3soS4yIa7O6zgQePm67y5gnHr6rjyf9WjRaHmHLJNLlmylliz5KgOayoY3QnsfUkiHnOjs22pb2yjvFpkDXH',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBTEWsAjEQH1oRjodNUGS6dDxqo_5Exoy1b1tlLBb9gmqKqcnx1vN0GZP1RGmn2t05zfGWbHXiUNt25gzhozZZ8Zvt8uoYj49pTl0jeuBsH4BA76ID2bVlR6sNTM-U8SA8ZFlNCYja4RFDnwTj2fqGOYtBiBL-4eQb2BQYx8psCsfhoLz177Codh0NMTzmatFq81auZbCLN_WlVtL57G7iPHctWjvpuxcCS1NmBpmwSIwbLJYH4P85feNnGtRRVA89knlfheEE7zIzH',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuB3BZV-TWcAjl8JL3DnrrjEDRchGsJfkQneKj_hboTpGb6egAxfKFFOxixqA1_af3PnpuZNZ-H8ExUopXPoI9wuPGLXTVI3h7DDMw2RiqiIEYfstt3ia6LJa4SkyiFWOa4KkjrZZVRgms04ryMX1AykpnWTO6Ety77pzIIixujaOwyc039nhrqmPzeG3o76rpwyoyZ8za6wuM_ygM20QW64wNQgqwrWNDPnrPTNmIEQRy43Wsa__cFfkf0sUtOY904o3IYB_xwYB52k',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBDuZABiJhf3qTtTx0RCdBOe9bnKX9av0oqRq6z3HLxcxHQz-m7MyuBhMRmfSviI-JlUMnEKuQyFcDrFk_kEIB-iXUqnutWrprHkFGMQtmJQG4zCVVhhMYHOy34uoHG459uHaStTgjPH6auMZ8uDxJnAuP3Jv_s7mELUEBtYhuuFMBAm_FkJCC4PHPxdcg9rlFqt4Gco82zhv3PwTq1A0DOrbCFSK3ru_4M154ZYBaO55BIiGd9pXHUtkQqu2hi0Ya2NQyGUeqqI-Zq'
    ];

    ngOnInit(): void {
        const routineId = this.route.snapshot.paramMap.get('id');
        if (routineId) {
            this.loadRoutine(parseInt(routineId));
        }
    }

    loadRoutine(id: number): void {
        this.loading.set(true);
        this.error.set(null);

        this.api.getRoutine(id).subscribe({
            next: (data: Routine) => {
                this.routine.set(data);
                // Select first day by default
                if (data.days && data.days.length > 0) {
                    this.selectedDay.set(data.days[0]);
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

    getDayImage(index: number): string {
        return this.dayImages[index % this.dayImages.length];
    }

    selectDay(day: RoutineDay): void {
        this.selectedDay.set(day);
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
        const name = exercise.exercise_detail?.name?.toLowerCase() || '';
        if (name.includes('squat') || name.includes('deadlift') || name.includes('press') || name.includes('bench')) {
            return 'Compound';
        } else if (name.includes('dips') || name.includes('pull up') || name.includes('push')) {
            return 'Bodyweight';
        }
        return 'Isolation';
    }

    getExerciseIcon(exercise: RoutineExercise): string {
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
            this.router.navigate(['/workouts/workout', routine.id, day.id]);
        }
    }

    viewExerciseDetail(exerciseId: number): void {
        this.router.navigate(['/workouts/exercise', exerciseId]);
    }
}
