import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MotivationService } from '../../../services/motivation';

@Component({
  selector: 'app-motivation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './motivation-modal.html',
  styleUrl: './motivation-modal.css',
})
export class MotivationModalComponent {
  private motivationService = inject(MotivationService);
  state$ = this.motivationService.modalState$;

  close() {
    this.motivationService.closeModal();
  }
}
