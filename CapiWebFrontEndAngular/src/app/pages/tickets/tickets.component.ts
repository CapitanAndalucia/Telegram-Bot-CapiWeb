import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiClientService } from '../../services/api-client.service';

interface Ticket {
  id: number;
  titulo: string;
  fecha: string;
  coste: number;
  moneda: string;
}

interface TicketForm {
  titulo: string;
  fecha: string;
  coste: string | number;
  moneda: string;
}

const EMPTY_FORM: TicketForm = {
  titulo: '',
  fecha: '',
  coste: '',
  moneda: 'EUR',
};

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tickets.component.html',
  styleUrls: ['./tickets.component.css']
})
export class TicketsComponent implements OnInit {
  private apiClient = inject(ApiClientService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  authStatus: 'checking' | 'ready' | 'unauthorized' = 'checking';
  user: any = null;
  tickets: Ticket[] = [];
  filteredTickets: Ticket[] = [];
  loadingTickets = false;
  error = '';
  info = '';
  modalOpen = false;
  editingTicket: Ticket | null = null;
  form: TicketForm = { ...EMPTY_FORM };

  filters = {
    from: '',
    to: '',
    ordering: '-fecha'
  };

  ngOnInit() {
    this.init();
  }

  async init() {
    try {
      const data = await this.apiClient.checkAuth();
      console.log("Data de inicio sesion", data);
      this.user = data;
      this.authStatus = 'ready';
      this.loadTickets();
    } catch (error) {
      this.authStatus = 'unauthorized';
      this.router.navigate(['/tickets/login'], { replaceUrl: true });
    }
  }

  loadTickets() {
    this.loadingTickets = true;
    this.error = '';

    const params: any = {};

    if (this.filters.from) {
      params.fecha__gte = `${this.filters.from}T00:00:00`;
    }

    if (this.filters.to) {
      params.fecha__lte = `${this.filters.to}T23:59:59`;
    }

    if (this.filters.ordering) {
      params.ordering = this.filters.ordering;
    }

    this.apiClient.listTickets(params).subscribe({
      next: (response: any) => {
        if (Array.isArray(response)) {
          this.tickets = response;
        } else if (response?.results) {
          this.tickets = response.results;
        } else {
          this.tickets = [];
        }
        this.filteredTickets = this.tickets;
        this.loadingTickets = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err.error?.error || 'No se pudieron cargar los tickets';
        this.loadingTickets = false;
        this.cdr.detectChanges();
      }
    });
  }

  applyFilters() {
    this.loadTickets();
  }

  clearFilters() {
    this.filters = { from: '', to: '', ordering: '-fecha' };
    this.loadTickets();
  }

  openModal(ticket: Ticket | null = null) {
    if (ticket) {
      this.editingTicket = ticket;
      this.form = {
        titulo: ticket.titulo,
        coste: ticket.coste,
        moneda: ticket.moneda || 'EUR',
        fecha: this.toLocalInput(ticket.fecha)
      };
    } else {
      this.editingTicket = null;
      this.form = { ...EMPTY_FORM };
    }
    this.modalOpen = true;
    this.info = '';
    this.error = '';
    this.cdr.detectChanges();
  }

  closeModal() {
    this.modalOpen = false;
    this.form = { ...EMPTY_FORM };
    this.editingTicket = null;
    this.cdr.detectChanges();
  }

  handleSubmit() {
    if (!this.form.titulo || !this.form.fecha || !this.form.coste) {
      this.error = 'Todos los campos son obligatorios';
      return;
    }

    const payload = {
      titulo: this.form.titulo.trim(),
      coste: parseFloat(this.form.coste.toString()),
      moneda: this.form.moneda,
      fecha: new Date(this.form.fecha).toISOString()
    };

    if (this.editingTicket) {
      this.apiClient.updateTicket(this.editingTicket.id, payload).subscribe({
        next: () => {
          this.info = 'Ticket actualizado correctamente';
          this.closeModal();
          this.loadTickets();
        },
        error: (err) => {
          this.error = err.error?.error || 'No se pudo guardar el ticket';
          this.cdr.detectChanges();
        }
      });
    } else {
      this.apiClient.createTicket(payload).subscribe({
        next: () => {
          this.info = 'Ticket creado correctamente';
          this.closeModal();
          this.loadTickets();
        },
        error: (err) => {
          this.error = err.error?.error || 'No se pudo guardar el ticket';
          this.cdr.detectChanges();
        }
      });
    }
  }

  handleDelete(ticketId: number) {
    if (!confirm('¿Eliminar este ticket?')) return;

    this.apiClient.deleteTicket(ticketId).subscribe({
      next: () => {
        this.info = 'Ticket eliminado';
        this.loadTickets();
      },
      error: (err) => {
        this.error = err.error?.error || 'No se pudo eliminar el ticket';
        this.cdr.detectChanges();
      }
    });
  }

  async handleLogout() {
    try {
      await this.apiClient.logout();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    } finally {
      this.router.navigate(['/tickets/login'], { replaceUrl: true });
    }
  }

  toLocalInput(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    return localISOTime;
  }

  formatDate(value: string): string {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    return date.toLocaleString('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  formatCurrency(amount: number, currency = 'EUR'): string {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(amount);
  }
}
