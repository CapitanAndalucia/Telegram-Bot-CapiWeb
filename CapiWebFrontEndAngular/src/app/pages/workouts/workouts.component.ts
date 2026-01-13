import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet, ChildrenOutletContexts } from '@angular/router';
import { slideInAnimation } from '../../animations';

@Component({
    selector: 'app-workouts',
    standalone: true,
    imports: [CommonModule, RouterOutlet],
    templateUrl: './workouts.component.html',
    styleUrls: [],
    animations: [slideInAnimation]
})
export class WorkoutsComponent {
    private contexts = inject(ChildrenOutletContexts);

    getRouteAnimationData() {
        return this.contexts.getContext('primary')?.route?.snapshot?.data?.['animation'];
    }
}

