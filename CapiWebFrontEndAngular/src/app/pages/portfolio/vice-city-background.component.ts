import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-vice-city-background',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './vice-city-background.component.html',
    styleUrls: ['./vice-city-background.component.css']
})
export class ViceCityBackgroundComponent {
    buildings = [21, 22, 23, 24, 25, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    roadLines = [0, 1, 2, 3, 4, 5];
    verticalWaves = [0, 1, 2, 3, 4, 5];
    horizontalWaves = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
}
