import { Component, signal, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { slideInAnimation } from './animations';
import { UploadWidgetComponent } from './shared/components/upload-widget/upload-widget.component';
import { MotivationModalComponent } from './shared/components/motivation-modal/motivation-modal';
import { WorkoutMiniPlayerComponent } from './shared/components/workout-mini-player/workout-mini-player.component';
import { MotivationService } from './services/motivation';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UploadWidgetComponent, MotivationModalComponent, WorkoutMiniPlayerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  animations: [slideInAnimation]
})
export class App implements OnInit {
  protected readonly title = signal('CapiWebFrontEndAngular');
  private motivationService = inject(MotivationService);

  ngOnInit() {
    // Motivation checks are now handled by the Workouts module directly
  }

  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData && outlet.activatedRouteData['animation'];
  }
}
