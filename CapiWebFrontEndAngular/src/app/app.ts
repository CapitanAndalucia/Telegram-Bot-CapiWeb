import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { slideInAnimation } from './animations';
import { UploadWidgetComponent } from './shared/components/upload-widget/upload-widget.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UploadWidgetComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  animations: [slideInAnimation]
})
export class App {
  protected readonly title = signal('CapiWebFrontEndAngular');

  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData && outlet.activatedRouteData['animation'];
  }
}
