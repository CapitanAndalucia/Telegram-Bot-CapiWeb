import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ApiClientService } from '../../../../services/api-client.service';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-motivation-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink],
    template: `
    <div class="fixed inset-0 w-full flex flex-col overflow-hidden bg-[#102217] font-workout text-white antialiased">
      <!-- Header -->
      <header class="shrink-0 z-40 bg-[#102217]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <a routerLink="/workouts/admin/motivation" class="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
            <span class="material-symbols-outlined">arrow_back</span>
        </a>
        <h1 class="text-2xl font-bold tracking-tight">{{ isEditing() ? 'Editar' : 'Nueva' }} Motivación</h1>
      </header>
      
      <!-- Dropdown Backdrop -->
      <div *ngIf="isGroupDropdownOpen()" class="fixed inset-0 z-40 cursor-default" (click)="isGroupDropdownOpen.set(false)"></div>

      <!-- Scrollable Content -->
      <main class="flex-1 overflow-y-auto p-6">
        <div class="max-w-3xl mx-auto">
            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-8">
                
                <!-- Group Section -->
                <section class="space-y-4">
                    <h2 class="text-sm font-bold text-[#13ec6a] uppercase tracking-wider">Configuración</h2>
                    <div class="bg-[#1d3627]/40 border border-white/5 rounded-2xl p-6 space-y-6">
                        
                        <!-- Group Selector Custom Dropdown -->
                        <div class="space-y-2 relative">
                            <label class="block text-sm font-medium text-gray-300">Grupo de Visualización</label>
                            
                            <button type="button" 
                                    (click)="isGroupDropdownOpen.set(!isGroupDropdownOpen())"
                                    class="w-full bg-[#102217] border border-white/10 rounded-xl px-4 py-3.5 text-white flex justify-between items-center transition-all hover:bg-black/20 focus:ring-2 focus:ring-[#13ec6a]">
                                <span class="truncate">{{ getSelectedGroupLabel() }}</span>
                                <span class="material-symbols-outlined text-gray-400 transition-transform duration-200"
                                      [class.rotate-180]="isGroupDropdownOpen()">expand_more</span>
                            </button>

                            <!-- Dropdown Menu -->
                            <div *ngIf="isGroupDropdownOpen()" 
                                 class="absolute z-50 mt-1 w-full bg-[#102217] border border-white/10 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div class="py-1">
                                    <button type="button" *ngFor="let option of groupOptions"
                                            (click)="selectGroup(option.value)"
                                            class="w-full text-left px-4 py-3 text-sm hover:bg-[#13ec6a]/10 hover:text-[#13ec6a] transition-colors flex items-center justify-between group"
                                            [class.text-[#13ec6a]]="form.get('group')?.value === option.value"
                                            [class.text-gray-300]="form.get('group')?.value !== option.value">
                                        {{ option.label }}
                                        <span *ngIf="form.get('group')?.value === option.value" class="material-symbols-outlined text-base">check</span>
                                    </button>
                                </div>
                            </div>
                            
                            <p class="text-xs text-gray-500 mt-2">Determina cuándo se mostrará esta imagen al usuario.</p>
                        </div>


                        <!-- Active Switch -->
                        <div class="flex items-center pt-2">
                             <label class="flex items-center gap-4 cursor-pointer group select-none">
                                <div class="relative">
                                    <input type="checkbox" formControlName="is_active" class="peer sr-only">
                                    <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#13ec6a]"></div>
                                </div>
                                <span class="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">Activo (Visible para usuarios)</span>
                            </label>
                        </div>
                    </div>
                </section>

                <!-- Content Section -->
                <section class="space-y-4">
                    <h2 class="text-sm font-bold text-[#13ec6a] uppercase tracking-wider">Contenido Visual</h2>
                    <div class="bg-[#1d3627]/40 border border-white/5 rounded-2xl p-6 space-y-6">
                        
                        <!-- Image Upload -->
                        <div class="space-y-3">
                            <label class="block text-sm font-medium text-gray-300">Imagen Motivacional</label>
                            
                            <!-- Preview Area -->
                            <div *ngIf="currentImageUrl" class="relative group rounded-xl overflow-hidden aspect-video bg-black/40 border-2 border-dashed border-gray-600/50 hover:border-[#13ec6a]/50 transition-colors">
                                <img [src]="currentImageUrl" class="w-full h-full object-contain">
                                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <p class="text-white font-medium text-sm">Click para cambiar</p>
                                </div>
                                <input type="file" (change)="onFileSelected($event)" accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer">
                            </div>

                            <!-- Empty State Upload -->
                            <div *ngIf="!currentImageUrl" class="relative rounded-xl overflow-hidden aspect-video bg-black/20 border-2 border-dashed border-gray-600 hover:border-[#13ec6a] transition-colors group cursor-pointer">
                                <div class="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                    <div class="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-[#13ec6a] group-hover:bg-[#13ec6a]/10 transition-colors">
                                        <span class="material-symbols-outlined">add_photo_alternate</span>
                                    </div>
                                    <p class="text-gray-400 text-sm font-medium group-hover:text-white transition-colors">Subir imagen</p>
                                    <p class="text-xs text-gray-600">PNG, JPG hasta 5MB</p>
                                </div>
                                <input type="file" (change)="onFileSelected($event)" accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer">
                            </div>
                        </div>

                        <!-- Description -->
                        <div class="space-y-2">
                            <label class="block text-sm font-medium text-gray-300">Frase o Descripción</label>
                            <textarea formControlName="description" rows="3" class="w-full bg-[#102217] border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#13ec6a] focus:border-transparent outline-none transition-all placeholder-gray-600 resize-none" placeholder="Escribe una frase inspiradora..."></textarea>
                        </div>
                    </div>
                </section>

                <!-- Action Buttons -->
                <div class="pt-4 flex justify-end gap-3 pb-20">
                    <a routerLink="/workouts/admin/motivation" class="px-6 py-3.5 rounded-full border border-white/10 text-gray-300 hover:bg-white/5 hover:text-white transition-colors font-bold text-sm">
                        Cancelar
                    </a>
                    <button type="submit" [disabled]="form.invalid || submitting()" class="px-8 py-3.5 bg-[#13ec6a] hover:bg-[#0fb650] text-[#102217] rounded-full font-bold text-sm shadow-[0_0_20px_rgba(19,236,106,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all transform active:scale-95">
                        {{ submitting() ? 'Guardando...' : 'Guardar Cambios' }}
                    </button>
                </div>

            </form>
        </div>
      </main>
    </div>
  `,
    styles: []
})
export class MotivationFormComponent implements OnInit {
    private fb = inject(FormBuilder);
    private api = inject(ApiClientService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    form: FormGroup;
    isEditing = signal<boolean>(false);
    submitting = signal<boolean>(false);
    currentImageUrl: string | null = null;
    selectedFile: File | null = null;
    id: number | null = null;

    isGroupDropdownOpen = signal<boolean>(false);
    groupOptions = [
        { value: 'welcome', label: 'Bienvenida (Welcome)' },
        { value: 'daily_first', label: 'Primera del Día (Daily First)' },
        { value: 'routine_complete', label: 'Rutina Completada (Routine Complete)' },
        { value: 'user_return', label: 'Usuario Regresa (User Return)' }
    ];

    constructor() {
        this.form = this.fb.group({
            group: ['daily_first', Validators.required],
            description: [''],
            is_active: [true]
        });
    }

    getSelectedGroupLabel(): string {
        const val = this.form.get('group')?.value;
        return this.groupOptions.find(o => o.value === val)?.label || 'Seleccionar Grupo';
    }

    selectGroup(val: string) {
        this.form.patchValue({ group: val });
        this.isGroupDropdownOpen.set(false);
    }

    async ngOnInit() {
        const idParam = this.route.snapshot.paramMap.get('id');
        if (idParam) {
            this.id = +idParam;
            this.isEditing.set(true);
            await this.loadData(this.id);
        }
    }

    async loadData(id: number) {
        try {
            // Access request dynamically if not in interface
            const data = await firstValueFrom((this.api as any).request(`/workouts/motivational-images/${id}/`, 'GET')) as any;

            this.form.patchValue({
                group: data.group,
                description: data.description,
                is_active: data.is_active
            });
            if (data.image) {
                this.currentImageUrl = data.image;
            }
        } catch (e) {
            console.error(e);
            this.router.navigate(['/workouts/admin/motivation']);
        }
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.selectedFile = file;
            const reader = new FileReader();
            reader.onload = () => {
                this.currentImageUrl = reader.result as string;
            };
            reader.readAsDataURL(file);
        }
    }

    async onSubmit() {
        if (this.form.invalid) return;
        this.submitting.set(true);

        try {
            const formData = new FormData();
            formData.append('group', this.form.get('group')?.value);
            formData.append('description', this.form.get('description')?.value);
            formData.append('is_active', this.form.get('is_active')?.value ? 'true' : 'false');

            if (this.selectedFile) {
                formData.append('image', this.selectedFile);
            }

            if (this.isEditing() && this.id) {
                await firstValueFrom(this.api.updateMotivationalImage(this.id, formData));
            } else {
                await firstValueFrom(this.api.createMotivationalImage(formData));
            }

            this.router.navigate(['/workouts/admin/motivation']);
        } catch (e) {
            console.error(e);
            alert('Error saving motivation');
        } finally {
            this.submitting.set(false);
        }
    }
}
