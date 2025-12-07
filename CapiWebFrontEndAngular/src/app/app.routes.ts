import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./pages/hub/hub.component').then(m => m.HubComponent),
        data: { animation: 'Hub' }
    },
    {
        path: 'login',
        loadComponent: () => import('./pages/auth/login.component').then(m => m.LoginComponent),
        data: { animation: 'Login' }
    },
    {
        path: 'register',
        loadComponent: () => import('./pages/auth/register.component').then(m => m.RegisterComponent),
        data: { animation: 'Register' }
    },
    {
        path: 'tickets',
        loadComponent: () => import('./pages/tickets/tickets.component').then(m => m.TicketsComponent),
        canActivate: [authGuard],
        data: { animation: 'Tickets' }
    },
    {
        path: 'fileshare',
        loadComponent: () => import('./pages/fileshare/fileshare.component').then(m => m.FileshareComponent),
        canActivate: [authGuard],
        data: { animation: 'Fileshare' }
    },
    {
        path: 'portafolio/portfolio_arte',
        loadComponent: () => import('./pages/portfolio/portfolio-arte.component').then(m => m.PortfolioArteComponent),
        data: { animation: 'PortfolioArte' }
    },
    {
        path: 'portfolio',
        loadComponent: () => import('./pages/portfolio/portfolio-personal.component').then(m => m.PortfolioPersonalComponent),
        data: { animation: 'PortfolioPersonal' }
    },
    {
        path: 'tickets',
        loadComponent: () => import('./pages/tickets/tickets.component').then(m => m.TicketsComponent),
        data: { animation: 'TicketsGuest' }
    },
    {
        path: 'api',
        loadComponent: () => import('./pages/api/api.component').then(m => m.ApiComponent),
        data: { animation: 'Api' }
    },
    {
        path: 'main',
        loadComponent: () => import('./pages/main-index/main-index.component').then(m => m.MainIndexComponent),
        data: { animation: 'Main' }
    },
    {
        path: '**',
        redirectTo: ''
    }
];
