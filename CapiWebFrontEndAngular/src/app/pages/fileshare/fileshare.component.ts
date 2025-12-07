import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiClientService } from '../../services/api-client.service';
import { ToastrService } from 'ngx-toastr';
import { FriendListComponent } from './components/friend-list/friend-list.component';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { IncomingFilesComponent } from './components/incoming-files/incoming-files.component';
import { NotificationCenterComponent } from './components/notification-center/notification-center.component';
import { UserIconComponent } from './components/user-icon/user-icon.component';

interface User {
  username: string;
  email?: string;
  is_staff?: boolean;
}

@Component({
  selector: 'app-fileshare',
  imports: [
    CommonModule,
    FriendListComponent,
    FileUploadComponent,
    IncomingFilesComponent,
    NotificationCenterComponent,
    UserIconComponent,
  ],
  templateUrl: './fileshare.component.html',
  styleUrls: ['./fileshare.component.css'],
})
export class FileshareComponent implements OnInit {
  activeTab = signal<'files' | 'upload'>('files');
  user = signal<User | null>(null);
  refreshTrigger = signal(0);
  loading = signal(true);
  isSidebarOpen = signal(false);
  unreadCount = signal(0);
  selectedRecipient = signal('');

  constructor(
    private apiClient: ApiClientService,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
    this.fetchUser();
  }

  async fetchUser(): Promise<void> {
    try {
      const userData = await this.apiClient.checkAuth();
      if (userData && userData.username) {
        this.user.set(userData);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      this.loading.set(false);
    }
  }

  handleUploadSuccess(): void {
    this.refreshTrigger.update((v) => v + 1);
    this.activeTab.set('files');
    this.selectedRecipient.set('');
  }

  handleSelectFriend(username: string): void {
    this.selectedRecipient.set(username);
    this.activeTab.set('upload');
  }

  async handleLogout(): Promise<void> {
    try {
      await this.apiClient.logout();
      this.user.set(null);
      this.activeTab.set('files');
    } catch (error) {
      console.error('Logout failed', error);
    }
  }

  setActiveTab(tab: 'files' | 'upload'): void {
    this.activeTab.set(tab);
  }

  toggleSidebar(): void {
    this.isSidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  onUnreadCountChange(count: number): void {
    this.unreadCount.set(count);
  }

  onRecipientChange(recipient: string): void {
    this.selectedRecipient.set(recipient);
  }
}
