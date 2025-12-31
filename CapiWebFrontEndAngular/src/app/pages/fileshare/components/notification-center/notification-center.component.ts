import { Component, OnInit, signal, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiClientService } from '../../../../services/api-client.service';

interface Notification {
    id: number;
    message: string;
    is_read: boolean;
}

interface FriendRequest {
    id: number;
    from_user_username: string;
}

@Component({
    selector: 'app-notification-center',
    imports: [CommonModule],
    templateUrl: './notification-center.component.html',
    styleUrls: ['../../fileshare.component.css'],
})
export class NotificationCenterComponent implements OnInit {
    accepted = output<void>();

    notifications = signal<Notification[]>([]);
    requests = signal<FriendRequest[]>([]);
    isOpen = signal(false);

    // Pagination
    displayedCount = signal(5);
    visibleNotifications = computed(() => {
        return this.notifications().slice(0, this.displayedCount());
    });
    hasMoreNotifications = computed(() => {
        return this.visibleNotifications().length < this.notifications().length;
    });

    constructor(private apiClient: ApiClientService) { }

    ngOnInit(): void {
        void this.fetchData();
    }

    async fetchData(): Promise<void> {
        try {
            const [notifsData, requestsData] = await Promise.all([
                this.apiClient.listNotifications(),
                this.apiClient.listFriendRequests(),
            ]);

            // Normalize paginated or flat array responses
            const notifications = Array.isArray(notifsData)
                ? notifsData
                : (notifsData?.results && Array.isArray(notifsData.results) ? notifsData.results : []);

            const requests = Array.isArray(requestsData)
                ? requestsData
                : (requestsData?.results && Array.isArray(requestsData.results) ? requestsData.results : []);

            this.notifications.set(notifications);
            this.requests.set(requests);
        } catch (error) {
            console.error('Error fetching notifications', error);
        }
    }

    toggleDropdown(): void {
        this.isOpen.update((v) => !v);
        if (this.isOpen()) {
            this.fetchData();
            // Reset pagination when opening
            this.displayedCount.set(5);
        }
    }

    loadMore(): void {
        this.displayedCount.update((c) => c + 15);
    }

    async handleAccept(id: number): Promise<void> {
        try {
            await this.apiClient.acceptFriendRequest(id);
            this.accepted.emit();
            this.fetchData();
        } catch (error) {
            console.error('Error accepting request', error);
        }
    }

    async handleReject(id: number): Promise<void> {
        try {
            await this.apiClient.rejectFriendRequest(id);
            this.fetchData();
        } catch (error) {
            console.error('Error rejecting request', error);
        }
    }

    async markAllAsRead(): Promise<void> {
        const unread = this.notifications().filter((n) => !n.is_read);
        if (unread.length === 0) return;

        try {
            await Promise.all(unread.map((n) => this.apiClient.markNotificationRead(n.id)));
            // Update local state instead of re-fetching everything
            this.notifications.update((notifs) =>
                notifs.map((n) => ({ ...n, is_read: true }))
            );
        } catch (error) {
            console.error('Error marking notifications as read', error);
            // Fallback to fetch
            void this.fetchData();
        }
    }

    get totalCount(): number {
        const unreadNotifs = Array.isArray(this.notifications())
            ? this.notifications().filter((n) => !n.is_read).length
            : 0;
        const pendingRequests = Array.isArray(this.requests())
            ? this.requests().length
            : 0;
        return unreadNotifs + pendingRequests;
    }
}
