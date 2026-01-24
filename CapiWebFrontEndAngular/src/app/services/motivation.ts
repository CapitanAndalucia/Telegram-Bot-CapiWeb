import { Injectable } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { MotivationalImage } from '../models/workouts';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class MotivationService {
  private modalState = new BehaviorSubject<{ isOpen: boolean, image: MotivationalImage | null }>({ isOpen: false, image: null });
  public modalState$ = this.modalState.asObservable();

  private readonly KEYS = {
    LAST_ACCESS: 'capi_last_access',
    DAILY_SHOWN: 'capi_daily_shown_date',
    WELCOME_SHOWN: 'capi_welcome_shown'
  };

  constructor(private apiClient: ApiClientService) { }

  /**
   * Called primarily by AppComponent on init.
   * Checks conditions and triggers modal if appropriate.
   */
  async checkAppStartConditions(): Promise<void> {
    // First, verify user is authenticated before calling protected endpoints
    try {
      await this.apiClient.checkAuth();
    } catch {
      // User not authenticated, skip motivation checks silently
      return;
    }

    // 1. Check Welcome (First time ever)
    const welcomeShown = localStorage.getItem(this.KEYS.WELCOME_SHOWN);
    if (!welcomeShown) {
      await this.triggerGroup('welcome');
      localStorage.setItem(this.KEYS.WELCOME_SHOWN, 'true');
      this.updateLastAccess();
      return; // Prioritize welcome, don't show daily too
    }

    // 2. Check User Return (2 weeks inactivity)
    const lastAccess = localStorage.getItem(this.KEYS.LAST_ACCESS);
    const now = new Date();

    if (lastAccess) {
      const lastDate = new Date(lastAccess);
      const diffTime = Math.abs(now.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 14) {
        await this.triggerGroup('user_return');
        this.updateLastAccess();
        return; // Prioritize return message
      }
    }

    // 3. Check Daily First (First time today)
    const lastDaily = localStorage.getItem(this.KEYS.DAILY_SHOWN);
    const today = new Date().toDateString();

    if (lastDaily !== today) {
      const shown = await this.triggerGroup('daily_first');
      if (shown) {
        localStorage.setItem(this.KEYS.DAILY_SHOWN, today);
      }
    }

    // Always update last access at the end of checks
    this.updateLastAccess();
  }

  /**
   * Called when a routine is completed.
   */
  async checkRoutineCompletion(): Promise<void> {
    await this.triggerGroup('routine_complete');
  }

  /**
   * Close the modal and mark the image as shown in backend.
   */
  async closeModal(): Promise<void> {
    const currentState = this.modalState.value;
    if (currentState.image) {
      try {
        await firstValueFrom(this.apiClient.markMotivationalImageAsShown(currentState.image.id, currentState.image.group));
      } catch (error) {
        console.error('Error marking motivation as shown', error);
      }
    }
    this.modalState.next({ isOpen: false, image: null });
  }

  // --- Private Helpers ---

  private async triggerGroup(group: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(this.apiClient.getNextMotivationalImage(group));
      if (response && response.id) {
        this.modalState.next({ isOpen: true, image: response });
        return true;
      }
    } catch {
      // No images available for this group - silently ignore
    }
    return false;
  }

  private updateLastAccess(): void {
    localStorage.setItem(this.KEYS.LAST_ACCESS, new Date().toISOString());
  }
}

