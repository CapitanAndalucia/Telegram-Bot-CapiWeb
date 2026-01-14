import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';

@Component({
    selector: 'app-workout-profile',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './workout-profile.component.html',
    styleUrls: ['./workout-profile.component.css']
})
export class WorkoutProfileComponent {
    private router = inject(Router);
    private location = inject(Location);
    private api = inject(ApiClientService);

    // User data signals
    user = signal<any>(null);
    loading = signal<boolean>(true);

    // Stats
    totalWorkouts = signal<number>(0);
    currentStreak = signal<number>(0);

    // Personal Records
    personalRecords = signal<any[]>([]);

    // App version (could be from environment)
    appVersion = '4.2.0';
    buildNumber = '882';

    ngOnInit(): void {
        this.loadUserData();
        this.loadStats();
        this.loadPersonalRecords();
    }

    loadUserData(): void {
        // Get user from checkAuth API
        this.api.checkAuth().then((response: any) => {
            if (response) {
                // Response may be { user: {...} } or directly the user object
                const userData = response.user || response;
                this.user.set(userData);
            }
            this.loading.set(false);
        }).catch((err: any) => {
            console.error('Error loading user:', err);
            this.loading.set(false);
        });
    }

    loadStats(): void {
        // Load all routines to calculate total workouts and streak
        this.api.listRoutines().subscribe({
            next: (response: any) => {
                // Handle paginated or direct array response
                const routines = Array.isArray(response) ? response : (response?.results || []);

                let totalCompletedDays = 0;
                let currentStreakDays = 0;

                // Get the most recent routine for streak calculation
                if (routines && routines.length > 0) {
                    const latestRoutine = routines[0]; // Assuming sorted by recent

                    // Count completed days across all routines
                    routines.forEach((routine: any) => {
                        if (routine.days) {
                            routine.days.forEach((day: any) => {
                                if (day.is_completed) {
                                    totalCompletedDays++;
                                }
                            });
                        }
                    });

                    // Streak calculation based on weekly completion
                    currentStreakDays = this.calculateStreak(latestRoutine);
                }

                this.totalWorkouts.set(totalCompletedDays);
                this.currentStreak.set(currentStreakDays);
            },
            error: (err: any) => {
                console.error('Error loading routines for stats:', err);
            }
        });
    }

    calculateStreak(routine: any): number {
        // Simplified streak calculation
        // In a full implementation, you would:
        // 1. Get all exercise sets grouped by week
        // 2. Check if each week met the required days
        // 3. Count consecutive weeks that met the requirement

        if (!routine?.days) return 0;

        const completedDaysThisWeek = routine.days.filter((d: any) => d.is_completed).length;
        const requiredDays = routine.days.length;

        // If user completed all required days this week, streak continues
        // This is a placeholder - real logic would need historical data
        return completedDaysThisWeek >= requiredDays ? completedDaysThisWeek : 0;
    }

    loadPersonalRecords(): void {
        // Load all routines and their exercises to find max weights
        this.api.listRoutines().subscribe({
            next: (response: any) => {
                // Handle paginated or direct array response
                const routines = Array.isArray(response) ? response : (response?.results || []);
                const exerciseMaxWeights: Map<string, { name: string; weight: number; icon: string }> = new Map();

                // Iterate through all routines, days, and exercises
                routines.forEach((routine: any) => {
                    if (routine.days) {
                        routine.days.forEach((day: any) => {
                            if (day.routine_exercises) {
                                day.routine_exercises.forEach((exercise: any) => {
                                    const name = exercise.exercise_detail?.name || 'Unknown';
                                    const weight = exercise.target_weight || 0;

                                    const existing = exerciseMaxWeights.get(name);
                                    if (!existing || weight > existing.weight) {
                                        exerciseMaxWeights.set(name, {
                                            name,
                                            weight,
                                            icon: 'fitness_center'
                                        });
                                    }
                                });
                            }
                        });
                    }
                });

                // Convert to array and sort by weight descending, take top 3
                const records = Array.from(exerciseMaxWeights.values())
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 3)
                    .map((record, index) => ({
                        id: index + 1,
                        name: record.name,
                        value: record.weight,
                        unit: 'kg',
                        icon: record.icon,
                        hasChart: index === 2 // Last one gets the chart
                    }));

                this.personalRecords.set(records.length > 0 ? records : [
                    { id: 1, name: 'Sin datos', value: 0, unit: 'kg', icon: 'fitness_center' }
                ]);
            },
            error: (err: any) => {
                console.error('Error loading personal records:', err);
            }
        });
    }

    // Computed values
    userName = computed(() => this.user()?.first_name || this.user()?.username || 'Usuario');
    memberSince = computed(() => {
        const date = this.user()?.date_joined;
        if (!date) return '';
        return new Date(date).getFullYear().toString();
    });
    userAvatar = computed(() => this.user()?.profile_picture_url || this.user()?.profile_image || null);

    // Navigation
    goBack(): void {
        this.location.back();
    }

    editProfile(): void {
        // Navigate to profile edit page (could be in settings module)
        this.router.navigate(['/settings/profile']);
    }

    // Menu actions
    openAccountSettings(): void {
        this.router.navigate(['/settings/account']);
    }

    openNotifications(): void {
        this.router.navigate(['/settings/notifications']);
    }

    openPrivacy(): void {
        this.router.navigate(['/settings/privacy']);
    }

    openHelpCenter(): void {
        // Could open external link or internal help page
        window.open('https://help.example.com', '_blank');
    }

    shareApp(): void {
        if (navigator.share) {
            navigator.share({
                title: 'Fitness App',
                text: '¡Prueba esta app de fitness!',
                url: window.location.origin
            });
        }
    }

    logout(): void {
        // Call API to invalidate session on server, then redirect
        this.api.logout().then(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            this.router.navigate(['/login']);
        }).catch((err: any) => {
            console.error('Error during logout:', err);
            // Still clear local data and redirect even if API fails
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            this.router.navigate(['/login']);
        });
    }
}
