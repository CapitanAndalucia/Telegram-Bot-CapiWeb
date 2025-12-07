import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiClientService } from '../../services/api-client.service';
import { HttpClientModule } from '@angular/common/http';
interface Technology {
    id: number;
    nombre: string;
    icono: string;
}

interface Project {
    id: number;
    titulo: string;
    descripcion: string;
    imagen: string;
    tecnologias: Technology[];
    categoria: string;
    link?: string;
    github?: string;
}

@Component({
    selector: 'app-portfolio-personal',
    standalone: true,
    imports: [CommonModule, HttpClientModule],
    templateUrl: './portfolio-personal.component.html',
    styleUrls: ['./portfolio-personal.component.css']
})
export class PortfolioPersonalComponent implements OnInit {
    activeFilter = signal<string>('All');
    activeSection = signal<string>('portfolio');
    isMenuOpen = signal<boolean>(false);
    projects: Project[] = [];
    technologies: Technology[] = [];
    constructor(private apiClient: ApiClientService) { }
    categories = ['All', 'Web', 'Mobile', 'Design', 'Backend'];



    // get filteredProjects(): Project[] {
    //     if (this.activeFilter() === 'All') {
    //         return this.projects;
    //     }
    //     return this.projects.filter(p => p.category === this.activeFilter());
    // }

    ngOnInit(): void {
        this.fetchProjects();
        this.fetchTechnologies();
    }

    private fetchProjects(): void {
        this.apiClient.listProyectos().subscribe({
            next: (data) => {
                if (Array.isArray(data)) {
                    // Map API fields (Spanish) to the Project interface (English)
                    this.projects = (Array.isArray(data) ? data : (data as any).results || Object.values(data)).map((p: any) => ({
                        id: p.id,
                        titulo: p.titulo,
                        descripcion: p.descripcion,
                        imagen: p.imagen,
                        tecnologias: p.tecnologias,
                        categoria: p.categoria || ''
                    }));

                } else if (data && typeof data === 'object' && 'results' in data) {
                    this.projects = (data as any).results as Project[];
                } else {
                    this.projects = Object.values(data) as Project[];
                }
                console.log(this.projects);
            },
            error: (err) => {
                console.error('Error fetching projects', err);
            }
        });
    }

    private fetchTechnologies(): void {
        this.apiClient.listTecnologias().subscribe({
            next: (data) => {
                if (Array.isArray(data)) {
                    this.technologies = data as Technology[];
                } else if (data && typeof data === 'object' && 'results' in data) {
                    this.technologies = (data as any).results as Technology[];
                } else {
                    this.technologies = Object.values(data) as Technology[];
                }
                console.log('Technologies:', this.technologies);
            },
            error: (err) => {
                console.error('Error fetching technologies', err);
            }
        });
    }

    // Genera el texto del marquee a partir de las tecnologías
    get marqueeText(): string {
        if (this.technologies.length === 0) {
            return 'CARGANDO... • ';
        }
        return this.technologies.map(t => t.nombre.toUpperCase()).join(' • ') + ' • ';
    }

    setFilter(category: string): void {
        this.activeFilter.set(category);
    }

    setActiveSection(section: string): void {
        this.activeSection.set(section);
    }

    toggleMenu(): void {
        this.isMenuOpen.update(value => !value);
        if (this.isMenuOpen()) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }

    scrollToSection(sectionId: string): void {
        const element = document.getElementById(sectionId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
            this.setActiveSection(sectionId);
            this.isMenuOpen.set(false);
            document.body.style.overflow = '';
        }
    }
}
