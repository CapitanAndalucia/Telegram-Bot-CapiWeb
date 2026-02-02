import { Component, Input, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
    selector: 'app-loading-spinner',
    standalone: true,
    imports: [CommonModule, MatProgressSpinnerModule],
    template: `
    <mat-spinner [diameter]="diameter" [mode]="mode" class="custom-spinner"></mat-spinner>
  `,
    styles: [`
    /* Override Material Spinner color to match our #13ec6a theme */
    :host ::ng-deep .custom-spinner circle {
      stroke: #13ec6a !important;
    }
  `],
    encapsulation: ViewEncapsulation.None
})
export class LoadingSpinnerComponent {
    @Input() diameter: number = 40;
    @Input() mode: 'determinate' | 'indeterminate' = 'indeterminate';
}
