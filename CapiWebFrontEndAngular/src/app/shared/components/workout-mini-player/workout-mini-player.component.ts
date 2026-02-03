import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkoutSessionService } from '../../../services/workout-session.service';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-workout-mini-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (shouldShow()) {
      <div class="fixed bottom-[88px] left-4 right-4 z-40">
        <!-- Main Player Card -->
        <div 
          class="bg-[#1d3627]/95 backdrop-blur-md border border-[#13ec6a]/30 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300"
          [class.rounded-b-none]="isExpanded()" 
          [class.border-b-0]="isExpanded()"
        >
          <div class="flex items-center justify-between p-3 relative">
            
            <!-- Progress Bar (Background) -->
            <div class="absolute bottom-0 left-0 h-1 bg-[#13ec6a]/20 w-full">
              <div class="h-full bg-[#13ec6a]" 
                   [style.width.%]="(session.completedExercisesCount() / (session.totalExercisesCount() || 1)) * 100">
              </div>
            </div>

            <!-- Click area to navigate (Left side) -->
            <div (click)="navigateToWorkout()" class="flex items-center gap-3 flex-1 cursor-pointer min-w-0 pr-2">
              
              <!-- Timer Circle -->
              <div class="size-10 rounded-full border-2 border-[#13ec6a] flex items-center justify-center bg-[#102217] shrink-0">
                <span class="material-symbols-outlined text-[#13ec6a] text-lg animate-pulse" *ngIf="!session.isPaused()">timer</span>
                <span class="material-symbols-outlined text-orange-500 text-lg" *ngIf="session.isPaused()">pause</span>
              </div>

              <!-- Text Info -->
              <div class="flex flex-col min-w-0">
                <span class="text-xs text-[#13ec6a] font-bold uppercase tracking-wider">
                  {{ session.isPaused() ? 'EN PAUSA' : 'EN CURSO' }}
                </span>
                <div class="flex items-baseline gap-1">
                    <span class="text-white font-mono font-bold text-lg leading-none">
                        {{ pad(session.hours()) }}:{{ pad(session.minutes()) }}:{{ pad(session.seconds()) }}
                    </span>
                </div>
              </div>
            </div>

            <!-- Controls (Right side) -->
            <div class="flex items-center gap-2 shrink-0 relative z-10">
              <!-- Expand/Collapse Details -->
              <button (click)="toggleExpand()" 
                      class="size-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-slate-300 transition-colors">
                <span class="material-symbols-outlined transition-transform duration-300" 
                      [class.rotate-180]="isExpanded()">keyboard_arrow_up</span>
              </button>

              <!-- Pause/Resume -->
              <button (click)="session.togglePause()" 
                      class="size-10 flex items-center justify-center rounded-full bg-[#13ec6a] text-[#102217] hover:bg-[#0fb650] transition-transform active:scale-95 shadow-lg shadow-[#13ec6a]/20">
                <span class="material-symbols-outlined text-xl font-bold">
                  {{ session.isPaused() ? 'play_arrow' : 'pause' }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Expanded Details Panel -->
        @if (isExpanded()) {
          <div class="bg-[#102217]/95 backdrop-blur-md border border-t-0 border-[#13ec6a]/30 rounded-b-2xl p-3 animate-slide-up origin-top shadow-xl">
            
            <!-- Context: Current Exercise -->
            @if (session.currentExercise(); as exercise) {
                <div class="flex items-start gap-3">
                    <div class="size-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-slate-400">fitness_center</span>
                    </div>
                    <div class="flex flex-col min-w-0">
                         <span class="text-[10px] text-slate-400 uppercase tracking-wider">Ejercicio Actual</span>
                         <h4 class="text-white font-bold text-sm truncate">{{ exercise.custom_name || exercise.exercise_detail.name }}</h4>
                         <p class="text-xs text-[#13ec6a]">
                            {{ exercise.target_sets }} series • {{ exercise.target_reps }} reps
                         </p>
                    </div>
                    
                    <button (click)="navigateToExercise(exercise)" 
                            class="ml-auto px-3 py-1.5 bg-[#13ec6a]/10 hover:bg-[#13ec6a]/20 text-[#13ec6a] text-xs font-bold rounded-lg transition-colors">
                        VER
                    </button>
                </div>
            } @else {
                <div class="text-center py-2 text-slate-400 text-xs">
                    Selecciona un ejercicio para comenzar
                </div>
            }

            <div class="mt-3 pt-3 border-t border-white/5 flex justify-between items-center text-xs">
                 <span class="text-slate-400">
                    {{ session.completedExercisesCount() }} / {{ session.totalExercisesCount() }} Completados
                 </span>
                 <button (click)="stopWorkout()" 
                         class="text-red-400 hover:text-red-300 font-medium flex items-center gap-1">
                     <span class="material-symbols-outlined text-sm">stop_circle</span>
                     Finalizar
                 </button>
            </div>

          </div>
        }
      </div>
    }
  `,
  styles: [`
    .animate-slide-up {
      animation: slideDown 0.2s ease-out forwards;
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class WorkoutMiniPlayerComponent {
  session = inject(WorkoutSessionService);
  private router = inject(Router);

  isExpanded = signal<boolean>(false);

  // Track current URL to determine visibility
  private currentUrl = signal<string>(this.router.url);

  constructor() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.currentUrl.set(e.urlAfterRedirects);
    });
  }

  shouldShow = computed(() => {
    if (!this.session.isActive()) return false;

    const url = this.currentUrl();
    const routineSlug = this.session.activeRoutineSlug();
    const daySlug = this.session.activeDaySlug();

    if (routineSlug && daySlug) {
      // Check if we are on the active workout page
      // The path is defined as /workouts/workout/:routineSlug/:daySlug
      const workoutPath = `/workouts/workout/${routineSlug}/${daySlug}`;
      if (url.includes(workoutPath)) {
        return false;
      }
    }

    return true;
  });

  pad(val: number): string {
    return val.toString().padStart(2, '0');
  }

  toggleExpand() {
    this.isExpanded.update(v => !v);
  }

  navigateToWorkout() {
    this.session.navigateToActiveWorkout();
  }

  navigateToExercise(exercise: any) {
    if (exercise?.url_slug) {
      this.router.navigate(['/workouts/exercise', exercise.url_slug]);
    } else {
      this.navigateToWorkout();
    }
  }

  stopWorkout() {
    // Navigate to summary or just clear?
    this.session.stopWorkout();
    // Optionally navigate home
    this.router.navigate(['/workouts']);
  }
}
