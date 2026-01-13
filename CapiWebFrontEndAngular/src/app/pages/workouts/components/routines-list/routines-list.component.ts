import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { Routine } from '../../../../models/workouts';

interface RoutineCategory {
    name: string;
    icon: string;
    color: string;
}

@Component({
    selector: 'app-routines-list',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './routines-list.component.html',
    styleUrls: [],
    styles: [`:host { display: block; }`]
})
export class RoutinesListComponent implements OnInit {
    private api = inject(ApiClientService);
    private router = inject(Router);

    routines = signal<Routine[]>([]);
    loading = signal<boolean>(true);
    error = signal<string | null>(null);
    selectedFilter = signal<string>('all');

    // Filter options
    filters = [
        { id: 'all', label: 'Todas' },
        { id: 'strength', label: 'Fuerza' },
        { id: 'cardio', label: 'Cardio' },
        { id: 'mobility', label: 'Movilidad' }
    ];

    // Placeholder images for routines without images
    routineImages = [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDirUQz06un2f6Cj1NBx76b984B2N1owzoFC_L9LWNi37Mydvy9vxIEg0Vgs32oPvo2_kcaBUZrXZpCWyPNsEbmwQlFa5zbcrmAUw2n4-9m_lvvKnOseuv4APgc5ujLsg8vtGfI1XfAnDB5-3Sdt_0ldj9flb4xEFyf6I7zNqLyHVyk5wkdo6Acna0R5_vy48jCXglE1hDA0gZVfTKnMu4n5fKv6qKuwcLnjozhzs3VUsjsPMNfTMtxiBS2godaXU4qGsVDA91qwAnV',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCDKSwPkOgSctmYERqnAKEAFE7gvBcd7BimA6oTWoYFlFB6X-8uvPoDP25diLdqQu7SZ6Xs5Qpae042EBmkyZMq4eQVnGibeAkLKOo0nK7iw46V8aE3JXa-hc2uEpn9J4cm8yhI-x7kakcXv2g6qspTH-C9sHcdVba9up7AiJDI0co-TmzGxRqUOM0zUhJNI3cTgrtp2YY3sHhUPLLyXeS0gSUe7jThDZ1SbK_5SjQbHLdJWTKpnZ383ix0qcdrI84zoiaEH83uWNLF',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBsirvZVI-CInJs3bdagr68s6him9krN-DUmGR3nzELPB652AMhHwp9HRwSKqaLNRiYTZyMtJhsK1o1XROUDj3d33lLdFDt7qJ5FFdMrTh7eO3D8KygqiLsUCy5Tovm5Z7KcvQ15p7cmmwp1sgJEZnR7-fSucB_EwCYEdmKSQlZLpVHycUGkjIBhEsMWLDI2qNR_3IUXI5k4RsCJFWyvI-63jvOXvcMMaNehE2lTRfAyWcXHO8QEqDhBOuAKQqJ-p5AqY4u9vwrH3Su'
    ];

    ngOnInit(): void {
        this.loadRoutines();
    }

    loadRoutines(): void {
        this.loading.set(true);
        this.error.set(null);

        this.api.listRoutines().subscribe({
            next: (data: any) => {
                // Handle both array and paginated response formats
                const routines = Array.isArray(data) ? data : (data.results || []);
                this.routines.set(routines);
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading routines:', err);
                this.error.set('Error al cargar las rutinas');
                this.loading.set(false);
            }
        });
    }

    selectFilter(filterId: string): void {
        this.selectedFilter.set(filterId);
    }

    filteredRoutines(): Routine[] {
        const filter = this.selectedFilter();
        const allRoutines = this.routines();

        if (filter === 'all') return allRoutines;

        return allRoutines.filter(routine => {
            const goal = routine.goal?.toLowerCase() || '';
            return goal.includes(filter);
        });
    }

    getRoutineImage(index: number): string {
        return this.routineImages[index % this.routineImages.length];
    }

    getRoutineCategory(routine: Routine): RoutineCategory {
        const goal = routine.goal?.toLowerCase() || '';
        if (goal.includes('strength') || goal.includes('bulking') || goal.includes('fuerza')) {
            return { name: 'Fuerza', icon: 'fitness_center', color: 'text-[#13ec6a]' };
        } else if (goal.includes('cardio') || goal.includes('hiit') || goal.includes('intensity')) {
            return { name: 'Alta Intensidad', icon: 'bolt', color: 'text-blue-400' };
        } else if (goal.includes('flex') || goal.includes('yoga') || goal.includes('mobility')) {
            return { name: 'Flexibilidad', icon: 'self_improvement', color: 'text-pink-400' };
        }
        return { name: 'Entrenamiento', icon: 'fitness_center', color: 'text-[#13ec6a]' };
    }

    getDaysPerWeek(routine: Routine): string {
        const count = routine.days?.length || 0;
        return `${count} Día${count !== 1 ? 's' : ''}/Semana`;
    }

    openRoutine(routine: Routine): void {
        this.router.navigate(['/workouts/routine', routine.id]);
    }

    createNewRoutine(): void {
        this.router.navigate(['/workouts/create']);
    }

    navigateTo(route: string): void {
        this.router.navigate([route]);
    }
}
