import { Component, inject, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';

@Component({
    selector: 'app-workout-profile',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './workout-profile.component.html',
    styleUrls: ['./workout-profile.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkoutProfileComponent {
    private router = inject(Router);
    private location = inject(Location);
    private api = inject(ApiClientService);
    private cdr = inject(ChangeDetectorRef);

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
        this.loadRoutineData(); // Single API call for stats + personal records
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
            this.cdr.markForCheck();
        }).catch((err: any) => {
            console.error('Error loading user:', err);
            this.loading.set(false);
            this.cdr.markForCheck();
        });
    }

    // Combined method: Single API call for both stats and personal records
    loadRoutineData(): void {
        this.api.getWorkoutStats().subscribe({
            next: (response: any) => {
                // Set stats directly from backend
                this.totalWorkouts.set(response.total_workouts || 0);
                this.currentStreak.set(response.current_streak || 0);

                // Set PRs
                const records = response.personal_records || [];
                this.personalRecords.set(records.length > 0 ? records : [
                    { id: 1, name: 'Sin datos', value: 0, unit: 'kg', icon: 'fitness_center' }
                ]);

                this.cdr.markForCheck();
            },
            error: (err: any) => {
                console.error('Error loading stats data:', err);
                this.cdr.markForCheck();
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
