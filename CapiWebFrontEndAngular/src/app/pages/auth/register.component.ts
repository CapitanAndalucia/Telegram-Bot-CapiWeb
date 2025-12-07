import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthComponent } from './auth.component';

@Component({
    selector: 'app-register',
    imports: [AuthComponent],
    template: '<app-auth initialMode="register" [redirectPath]="redirectPath" [customTitle]="customTitle"></app-auth>'
})
export class RegisterComponent implements OnInit {
    redirectPath = '/';
    customTitle?: string;

    constructor(private route: ActivatedRoute) { }

    ngOnInit() {
        this.route.queryParams.subscribe(params => {
            this.redirectPath = params['redirect'] || '/';
            this.customTitle = params['title'];
        });
    }
}
