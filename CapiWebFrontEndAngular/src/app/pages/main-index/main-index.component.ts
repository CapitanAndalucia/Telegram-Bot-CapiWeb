import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-index',
  imports: [CommonModule],
  template: `
    <div style="padding: 2rem; color: white;">
      <h1>Main Index</h1>
      <p>Componente de índice principal en desarrollo - migrar desde React</p>
    </div>
  `
})
export class MainIndexComponent {}
