import { Component, OnInit, signal } from '@angular/core';
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
    notifications = signal<Notification[]>([]);
    requests = signal<FriendRequest[]>([]);
    isOpen = signal(false);

    constructor(private apiClient: ApiClientService) { }

    ngOnInit(): void { }

    async fetchData(): Promise<void> {
        try {
            const [notifsData, requestsData] = await Promise.all([
                this.apiClient.listNotifications(),
                this.apiClient.listFriendRequests(),
            ]);
            this.notifications.set(notifsData);
            this.requests.set(requestsData);
        } catch (error) {
            console.error('Error fetching notifications', error);
        }
    }

    toggleDropdown(): void {
        this.isOpen.update((v) => !v);
        if (this.isOpen()) {
            this.fetchData();
        }
    }

    async handleAccept(id: number): Promise<void> {
        try {
            await this.apiClient.acceptFriendRequest(id);
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
