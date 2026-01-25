import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../../../services/api-client.service';
import { firstValueFrom } from 'rxjs';
import { AdminExerciseModalComponent } from './admin-exercise-modal/admin-exercise-modal.component';

@Component({
    selector: 'app-exercises-admin',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule, AdminExerciseModalComponent],
    template: `
    <div class="fixed inset-0 w-full flex flex-col overflow-hidden bg-[#102217] font-workout text-white">
      <!-- Header -->
      <header class="shrink-0 z-40 bg-[#102217]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <a routerLink="/workouts/admin" class="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
            <span class="material-symbols-outlined">arrow_back</span>
        </a>
        <h1 class="text-xl font-bold tracking-tight">Administrar Ejercicios</h1>
      </header>

      <!-- Content -->
      <main class="flex-1 overflow-y-auto p-4 pb-32">
        <!-- Search -->
        <div class="relative mb-6">
            <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input type="text" [(ngModel)]="searchQuery" (ngModelChange)="filterExercises()" 
                placeholder="Buscar ejercicios..." 
                class="w-full bg-[#1d3627] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#13ec6a]/50">
        </div>

        <!-- List -->
        <div class="space-y-3">
            <div *ngFor="let ex of filteredExercises()" class="bg-[#1d3627]/40 border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-[#13ec6a]/30 transition-colors">
                <div class="flex items-center gap-4 flex-1 overflow-hidden">
                    <div class="w-12 h-12 shrink-0 rounded-lg bg-[#13ec6a]/10 flex items-center justify-center text-[#13ec6a]">
                        @if (ex.icon && ex.icon.includes('/')) {
                             <img [src]="ex.icon" class="w-8 h-8 object-contain filter-green">
                        } @else {
                            <span class="material-symbols-outlined">{{ ex.icon || 'fitness_center' }}</span>
                        }
                    </div>
                    <div class="min-w-0 pr-2">
                        <h3 class="font-bold text-white truncate">{{ ex.name }}</h3>
                        <p class="text-xs text-slate-400 line-clamp-1 mb-1">{{ ex.description || 'Sin descripción' }}</p>
                        <div class="flex gap-2">
                             <span class="text-[10px] font-bold text-[#13ec6a] bg-[#13ec6a]/10 px-1.5 py-0.5 rounded border border-[#13ec6a]/20">
                                {{ ex.default_sets }} sets
                             </span>
                             <span class="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                {{ ex.default_reps }} reps
                             </span>
                        </div>
                    </div>
                </div>
                
                <div class="flex items-center gap-2 pl-2">
                     <button (click)="openEditModal(ex)" class="w-9 h-9 flex items-center justify-center rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors" title="Editar">
                        <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                     </button>
                     <button (click)="deleteExercise(ex.id)" class="w-9 h-9 flex items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" title="Eliminar">
                        <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                    </button>
                </div>
            </div>
            
            <div *ngIf="filteredExercises().length === 0 && !loading()" class="text-center py-10 text-slate-500">
                No se encontraron ejercicios
            </div>
            
            <div *ngIf="loading()" class="text-center py-10 text-slate-400">
                Cargando...
            </div>
        </div>
      </main>

      <!-- FAB Add Exercise -->
       <div class="fixed bottom-6 right-6 z-40">
            <button (click)="openCreateModal()" class="flex items-center gap-3 bg-[#13ec6a] text-[#102217] hover:bg-[#0fb650] h-14 pl-5 pr-6 rounded-full shadow-[0_4px_20px_rgba(19,236,106,0.3)] transition-all active:scale-95 active:shadow-none group cursor-pointer">
                <span class="material-symbols-outlined group-hover:rotate-90 transition-transform"
                    style="font-size: 24px;">add</span>
                <span class="font-bold text-base tracking-wide">Nuevo Ejercicio</span>
            </button>
        </div>

        <!-- NEW Rich Modal -->
        @if (showModal()) {
            <app-admin-exercise-modal 
                [exercise]="editingExercise()" 
                (onClose)="closeModal()" 
                (onSaved)="onExerciseSaved($event)">
            </app-admin-exercise-modal>
        }

    </div>
  `
})
export class ExercisesAdminComponent implements OnInit {
    private api = inject(ApiClientService);

    exercises = signal<any[]>([]);
    filteredExercises = signal<any[]>([]);
    searchQuery = '';
    loading = signal<boolean>(true);

    // Modal state
    showModal = signal<boolean>(false);
    editingExercise = signal<any>(null);

    async ngOnInit() {
        await this.loadExercises();
    }

    async loadExercises() {
        this.loading.set(true);
        try {
            const response: any = await firstValueFrom(this.api.getExerciseLibrary(false));
            const data = Array.isArray(response) ? response : (response.results || []);
            // Sort by name
            data.sort((a: any, b: any) => a.name.localeCompare(b.name));
            this.exercises.set(data);
            this.filterExercises();
        } catch (e) {
            console.error('Error loading exercises', e);
        } finally {
            this.loading.set(false);
        }
    }

    filterExercises() {
        if (!this.searchQuery) {
            this.filteredExercises.set(this.exercises());
            return;
        }
        const q = this.searchQuery.toLowerCase();
        this.filteredExercises.set(
            this.exercises().filter(ex =>
                ex.name.toLowerCase().includes(q) ||
                (ex.description && ex.description.toLowerCase().includes(q))
            )
        );
    }

    async deleteExercise(id: number) {
        if (!confirm('¿Estás seguro de eliminar este ejercicio? Se eliminará de la biblioteca.')) return;
        try {
            await firstValueFrom(this.api.deleteExercise(id));
            this.exercises.update(list => list.filter(e => e.id !== id));
            this.filterExercises();
        } catch (e) {
            alert('Error al eliminar ejercicio. Puede que esté en uso.');
            console.error(e);
        }
    }

    // Modal actions
    openCreateModal() {
        this.editingExercise.set(null);
        this.showModal.set(true);
    }

    openEditModal(ex: any) {
        this.editingExercise.set(ex);
        this.showModal.set(true);
    }

    closeModal() {
        this.showModal.set(false);
        this.editingExercise.set(null);
    }

    onExerciseSaved(savedExercise: any) {
        // If we edited, replace. If new, add.
        // We can just reload or update local list.
        // Updating local list is faster.

        this.exercises.update(list => {
            const index = list.findIndex(e => e.id === savedExercise.id);
            if (index !== -1) {
                // Update
                const newList = [...list];
                newList[index] = savedExercise;
                return newList;
            } else {
                // Add new
                return [savedExercise, ...list];
            }
        });
        this.filterExercises();
    }
}
