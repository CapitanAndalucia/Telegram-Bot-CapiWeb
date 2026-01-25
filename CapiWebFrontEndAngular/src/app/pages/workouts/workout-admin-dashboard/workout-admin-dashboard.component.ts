import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-workout-admin-dashboard',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
    <div class="fixed inset-0 w-full flex flex-col overflow-hidden bg-[#102217] font-workout text-white">
      <!-- Header -->
      <header class="shrink-0 z-40 bg-[#102217]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <a routerLink="/workouts" class="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
            <span class="material-symbols-outlined">arrow_back</span>
        </a>
        <h1 class="text-2xl font-bold tracking-tight">Admin Rutinas</h1>
      </header>

      <!-- Main Menu -->
      <main class="flex-1 overflow-y-auto p-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            
            <!-- Exercises Card -->
            <a routerLink="/workouts/admin/exercises" class="group relative bg-[#1d3627]/40 border border-white/5 rounded-2xl p-8 hover:bg-[#1d3627]/60 hover:border-[#13ec6a]/30 transition-all duration-300 flex flex-col items-center text-center gap-4 cursor-pointer">
                <div class="w-16 h-16 rounded-full bg-[#13ec6a]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <span class="material-symbols-outlined text-[#13ec6a] text-4xl">fitness_center</span>
                </div>
                <div>
                    <h2 class="text-xl font-bold text-white mb-2">Ejercicios</h2>
                    <p class="text-slate-400 text-sm">Gestionar biblioteca de ejercicios por defecto</p>
                </div>
            </a>

            <!-- Motivation Card -->
            <a routerLink="/workouts/admin/motivation" class="group relative bg-[#1d3627]/40 border border-white/5 rounded-2xl p-8 hover:bg-[#1d3627]/60 hover:border-[#13ec6a]/30 transition-all duration-300 flex flex-col items-center text-center gap-4 cursor-pointer">
                <div class="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <span class="material-symbols-outlined text-amber-500 text-4xl">lightbulb</span>
                </div>
                <div>
                    <h2 class="text-xl font-bold text-white mb-2">Motivación</h2>
                    <p class="text-slate-400 text-sm">Gestionar imágenes y frases motivacionales</p>
                </div>
            </a>

        </div>
      </main>
    </div>
  `
})
export class WorkoutAdminDashboardComponent { }
