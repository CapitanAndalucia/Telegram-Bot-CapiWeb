import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { ApiClientService } from '../services/api-client.service';

export const superUserGuard: CanActivateFn = async (route, state) => {
    const apiClient = inject(ApiClientService);
    const router = inject(Router);

    try {
        const user = await apiClient.checkAuth();
        if (user && user.is_superuser) {
            return true;
        }
        // Not superuser, redirect to home
        router.navigate(['/']);
        return false;
    } catch (error) {
        // Not logged in or error
        router.navigate(['/login'], {
            queryParams: { redirect: state.url }
        });
        return false;
    }
};
