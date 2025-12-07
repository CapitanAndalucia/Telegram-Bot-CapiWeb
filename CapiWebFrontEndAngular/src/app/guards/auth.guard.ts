import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { ApiClientService } from '../services/api-client.service';

export const authGuard: CanActivateFn = async (route, state) => {
    const apiClient = inject(ApiClientService);
    const router = inject(Router);

    try {
        await apiClient.checkAuth();
        return true;
    } catch (error) {
        // Redirect to login with the intended URL
        router.navigate(['/login'], {
            queryParams: { redirect: state.url }
        });
        return false;
    }
};
