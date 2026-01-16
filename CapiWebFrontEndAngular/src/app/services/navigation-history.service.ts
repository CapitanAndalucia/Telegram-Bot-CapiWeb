import { Injectable } from '@angular/core';

/**
 * Service to manage navigation history for "go back" functionality.
 * Uses sessionStorage to avoid polluting URLs with query params.
 */
@Injectable({
    providedIn: 'root'
})
export class NavigationHistoryService {
    private readonly RETURN_URL_KEY = 'workout_return_url';
    private readonly PREVIOUS_URL_KEY = 'workout_previous_url';

    /**
     * Set the URL to return to after completing an action
     */
    setReturnUrl(url: string): void {
        sessionStorage.setItem(this.RETURN_URL_KEY, url);
    }

    /**
     * Get and clear the return URL
     */
    getReturnUrl(): string | null {
        const url = sessionStorage.getItem(this.RETURN_URL_KEY);
        sessionStorage.removeItem(this.RETURN_URL_KEY);
        return url;
    }

    /**
     * Peek at return URL without clearing it
     */
    peekReturnUrl(): string | null {
        return sessionStorage.getItem(this.RETURN_URL_KEY);
    }

    /**
     * Set the previous URL (for tracking where user came from)
     */
    setPreviousUrl(url: string): void {
        sessionStorage.setItem(this.PREVIOUS_URL_KEY, url);
    }

    /**
     * Get and clear the previous URL
     */
    getPreviousUrl(): string | null {
        const url = sessionStorage.getItem(this.PREVIOUS_URL_KEY);
        sessionStorage.removeItem(this.PREVIOUS_URL_KEY);
        return url;
    }

    /**
     * Peek at previous URL without clearing it
     */
    peekPreviousUrl(): string | null {
        return sessionStorage.getItem(this.PREVIOUS_URL_KEY);
    }

    /**
     * Clear all navigation history
     */
    clear(): void {
        sessionStorage.removeItem(this.RETURN_URL_KEY);
        sessionStorage.removeItem(this.PREVIOUS_URL_KEY);
    }
}
