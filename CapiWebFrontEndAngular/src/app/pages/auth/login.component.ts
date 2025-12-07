import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthComponent } from './auth.component';

@Component({
    selector: 'app-login',
    imports: [AuthComponent],
    template: '<app-auth initialMode="login" [redirectPath]="redirectPath" [customTitle]="customTitle"></app-auth>'
})
export class LoginComponent implements OnInit {
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
