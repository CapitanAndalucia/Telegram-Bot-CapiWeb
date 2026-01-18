import { Component, signal, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { slideInAnimation } from './animations';
import { UploadWidgetComponent } from './shared/components/upload-widget/upload-widget.component';
import { MotivationModalComponent } from './shared/components/motivation-modal/motivation-modal';
import { MotivationService } from './services/motivation';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UploadWidgetComponent, MotivationModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  animations: [slideInAnimation]
})
export class App implements OnInit {
  protected readonly title = signal('CapiWebFrontEndAngular');
  private motivationService = inject(MotivationService);

  ngOnInit() {
    // Check for motivation opportunities (Welcome / User Return / Daily)
    this.motivationService.checkAppStartConditions();
  }

  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData && outlet.activatedRouteData['animation'];
  }
}
