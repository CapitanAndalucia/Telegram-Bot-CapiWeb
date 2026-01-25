import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiClientService } from '../../../services/api-client.service';
import { MotivationalImage } from '../../../models/workouts';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-motivation-admin',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="fixed inset-0 w-full flex flex-col overflow-hidden bg-[#102217] font-workout text-white antialiased">
    <!-- Header -->
      <header class="shrink-0 z-40 bg-[#102217]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <a routerLink="/workouts/admin" class="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
            <span class="material-symbols-outlined">arrow_back</span>
        </a>
        <h1 class="text-2xl font-bold tracking-tight">Admin Motivación</h1>
      </header>

      <!-- Content -->
      <main class="flex-1 overflow-y-auto p-6 pb-40">
        <div *ngIf="loading()" class="flex justify-center py-12">
            <div class="w-8 h-8 border-2 border-[#13ec6a] border-t-transparent rounded-full animate-spin"></div>
        </div>

        <div *ngIf="!loading()" class="grid grid-cols-1 gap-4">
            <div *ngFor="let img of images()" class="group relative bg-[#1d3627]/40 border border-white/5 rounded-2xl overflow-hidden shadow-lg hover:border-[#13ec6a]/30 transition-all duration-300">
                
                <div class="flex h-32">
                    <!-- Image Side -->
                    <div class="w-1/3 relative overflow-hidden bg-[#102217]">
                        <img [src]="img.image || 'assets/placeholder.png'" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <div *ngIf="!img.is_active" class="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span class="px-2 py-0.5 bg-red-500/80 text-white rounded text-[10px] font-bold uppercase">Inactivo</span>
                        </div>
                    </div>

                    <!-- Content Side -->
                    <div class="w-2/3 p-4 flex flex-col justify-between">
                        <div>
                            <div class="flex justify-between items-start mb-1">
                                <span class="px-2 py-0.5 bg-[#13ec6a]/10 text-[#13ec6a] text-[10px] font-bold uppercase tracking-wider rounded border border-[#13ec6a]/20">
                                    {{ img.group_display }}
                                </span>
                                <span class="text-xs text-slate-500 font-mono">#{{ img.order }}</span>
                            </div>
                            <p class="text-white text-sm font-medium line-clamp-2 leading-snug italic">"{{ img.description }}"</p>
                        </div>

                        <div class="flex gap-2 mt-2 justify-end">
                             <a [routerLink]="['/workouts/motivation/edit', img.id]" 
                               class="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors border border-white/5">
                                Editar
                            </a>
                            <button (click)="deleteImage(img.id)" 
                                    class="w-8 h-8 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors">
                                <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Empty State -->
            <div *ngIf="images().length === 0" class="flex flex-col items-center justify-center py-20 text-center">
                <div class="w-20 h-20 bg-[#1d3627] rounded-full flex items-center justify-center mb-6">
                    <span class="material-symbols-outlined text-[#13ec6a] text-4xl">image</span>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">Sin imágenes</h3>
                <p class="text-gray-400 mb-6 text-sm px-6">No hay imágenes motivacionales configuradas.</p>
            </div>
        </div>
      </main>

      <!-- Floating Action Button -->
        <div class="fixed bottom-24 right-5 z-40">
            <a routerLink="/workouts/motivation/new"
                class="flex items-center gap-3 bg-[#13ec6a] text-[#102217] hover:bg-[#0fb650] h-14 pl-5 pr-6 rounded-full shadow-[0_4px_20px_rgba(19,236,106,0.3)] transition-all active:scale-95 active:shadow-none group cursor-pointer decoration-0">
                <span class="material-symbols-outlined group-hover:rotate-90 transition-transform"
                    style="font-size: 24px;">add</span>
                <span class="font-bold text-base tracking-wide">Nueva Imagen</span>
            </a>
        </div>

      <!-- Bottom Navigation -->
        <nav class="fixed bottom-0 w-full z-50 bg-[#102217]/90 backdrop-blur-lg border-t border-white/5">
            <div class="flex justify-around items-center h-16 sm:h-20 max-w-lg mx-auto px-2">
                <a routerLink="/"
                    class="flex flex-col items-center justify-center w-16 h-full gap-1 text-gray-500 hover:text-gray-300">
                    <span class="material-symbols-outlined" style="font-size: 26px;">home</span>
                    <span class="text-[10px] font-medium">Inicio</span>
                </a>
                <a routerLink="/workouts" class="flex flex-col items-center justify-center w-16 h-full gap-1 text-gray-500 hover:text-gray-300">
                    <span class="material-symbols-outlined" style="font-size: 26px;">fitness_center</span>
                    <span class="text-[10px] font-medium">Rutinas</span>
                </a>
                 <a routerLink="/workouts/admin" class="flex flex-col items-center justify-center w-16 h-full gap-1 text-[#13ec6a]">
                    <span class="material-symbols-outlined" style="font-size: 26px;">admin_panel_settings</span>
                    <span class="text-[10px] font-bold">Admin</span>
                </a>
                <button
                    class="flex flex-col items-center justify-center w-16 h-full gap-1 text-gray-500 hover:text-gray-300">
                    <span class="material-symbols-outlined" style="font-size: 26px;">monitoring</span>
                    <span class="text-[10px] font-medium">Progreso</span>
                </button>
                <a routerLink="/workouts/profile"
                    class="flex flex-col items-center justify-center w-16 h-full gap-1 text-gray-500 hover:text-gray-300">
                    <span class="material-symbols-outlined" style="font-size: 26px;">person</span>
                    <span class="text-[10px] font-medium">Perfil</span>
                </a>
            </div>
            <!-- Safe area spacer -->
            <div class="h-[env(safe-area-inset-bottom)]"></div>
        </nav>
    </div>
  `,
  styles: []
})
export class MotivationAdminComponent implements OnInit {
  private api = inject(ApiClientService);

  images = signal<MotivationalImage[]>([]);
  loading = signal<boolean>(true);

  async ngOnInit() {
    await this.loadImages();
  }

  async loadImages() {
    this.loading.set(true);
    try {
      const response: any = await firstValueFrom(this.api.getMotivationalImages());
      // Handle pagination (results array) or direct array
      const data = Array.isArray(response) ? response : (response.results || []);
      this.images.set(data as MotivationalImage[]);
    } catch (e) {
      console.error('Error loading images', e);
    } finally {
      this.loading.set(false);
    }
  }

  async deleteImage(id: number) {
    if (!confirm('Are you sure you want to delete this image?')) return;
    try {
      await firstValueFrom(this.api.deleteMotivationalImage(id));
      // Remove from list immediately
      this.images.update(imgs => imgs.filter(i => i.id !== id));
    } catch (e) {
      alert('Error deleting image');
      console.error(e);
    }
  }
}
