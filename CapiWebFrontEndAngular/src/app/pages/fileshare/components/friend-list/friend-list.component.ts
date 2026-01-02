import {
    Component,
    OnInit,
    OnDestroy,
    output,
    signal,
    effect,
    ElementRef,
    ViewChild,
    input,
    untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../../../services/api-client.service';
import { ToastrService } from 'ngx-toastr';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

interface Friend {
    id: number;
    username: string;
    profile_picture_url?: string;
}

interface SearchUser {
    id: number;
    username: string;
}

@Component({
    selector: 'app-friend-list',
    imports: [CommonModule, FormsModule],
    templateUrl: './friend-list.component.html',
    styleUrls: ['../../fileshare.component.css'],
})
export class FriendListComponent implements OnInit, OnDestroy {
    @ViewChild('dropdownRef') dropdownRef?: ElementRef;

    selectFriend = output<string>();
    refreshTrigger = input<number>(0);

    friends = signal<Friend[]>([]);
    newFriend = signal('');
    loading = signal(false);
    searchResults = signal<SearchUser[]>([]);
    showDropdown = signal(false);
    searching = signal(false);

    private searchSubject = new Subject<string>();
    private clickListener?: (event: MouseEvent) => void;

    constructor(
        private apiClient: ApiClientService,
        private toastr: ToastrService
    ) {
        // Setup debounced search
        this.searchSubject
            .pipe(debounceTime(300), distinctUntilChanged())
            .subscribe(async (searchTerm) => {
                if (searchTerm.trim().length > 0) {
                    this.searching.set(true);
                    try {
                        const results = await this.apiClient.searchUsers(searchTerm.trim());
                        this.searchResults.set(results);
                        this.showDropdown.set(true);
                    } catch (error) {
                        console.error('Search error:', error);
                        this.searchResults.set([]);
                    } finally {
                        this.searching.set(false);
                    }
                } else {
                    this.searchResults.set([]);
                    this.showDropdown.set(false);
                    this.searching.set(false);
                }
            });

        effect(() => {
            const trigger = this.refreshTrigger();
            if (trigger > 0) {
                untracked(() => {
                    void this.fetchFriends();
                });
            }
        });
    }

    ngOnInit(): void {
        this.fetchFriends();
        this.setupClickOutsideListener();
    }

    ngOnDestroy(): void {
        this.searchSubject.complete();
        if (this.clickListener) {
            document.removeEventListener('mousedown', this.clickListener);
        }
    }

    setupClickOutsideListener(): void {
        this.clickListener = (event: MouseEvent) => {
            if (
                this.dropdownRef &&
                !this.dropdownRef.nativeElement.contains(event.target)
            ) {
                this.showDropdown.set(false);
            }
        };
        document.addEventListener('mousedown', this.clickListener);
    }

    onSearchChange(value: string): void {
        this.newFriend.set(value);
        this.searchSubject.next(value);
    }

    async fetchFriends(): Promise<void> {
        try {
            const data = await this.apiClient.listFriends();
            this.friends.set(data);
        } catch (error) {
            console.error('Error fetching friends', error);
        }
    }

    async handleAddFriend(username: string): Promise<void> {
        this.loading.set(true);
        const loadingToast = this.toastr.info(
            `Enviando solicitud a ${username}...`,
            '',
            { disableTimeOut: true }
        );

        try {
            await this.apiClient.sendFriendRequest(username);
            this.toastr.clear(loadingToast.toastId);
            this.toastr.success('Solicitud enviada correctamente');
            this.newFriend.set('');
            this.showDropdown.set(false);
            this.searchResults.set([]);
        } catch (err: any) {
            const errorMsg = err.payload?.error || 'Error al enviar solicitud';
            this.toastr.clear(loadingToast.toastId);
            this.toastr.error(errorMsg);
        } finally {
            this.loading.set(false);
        }
    }

    handleSelectUser(username: string): void {
        this.handleAddFriend(username);
    }

    handleSelectFriend(username: string): void {
        this.selectFriend.emit(username);
        this.toastr.success(`${username} seleccionado para enviar archivo`);
    }

    handleRemoveFriend(username: string): void {
        const toastRef = this.toastr.warning(
            `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="font-weight: bold; font-size: 15px;">¿Eliminar a ${username}?</div>
        <div style="font-size: 13px; opacity: 0.9;">Esta acción no se puede deshacer</div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button id="confirm-remove-${username}" style="flex: 1; padding: 8px 16px; background: linear-gradient(135deg, #FF3366 0%, #CC0044 100%); border: none; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; font-size: 13px;">Eliminar</button>
          <button id="cancel-remove-${username}" style="flex: 1; padding: 8px 16px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: white; cursor: pointer; font-size: 13px;">Cancelar</button>
        </div>
      </div>
    `,
            '',
            {
                disableTimeOut: true,
                closeButton: false,
                enableHtml: true,
            }
        );

        setTimeout(() => {
            const confirmBtn = document.getElementById(`confirm-remove-${username}`);
            const cancelBtn = document.getElementById(`cancel-remove-${username}`);

            if (confirmBtn) {
                confirmBtn.onclick = () => {
                    this.toastr.clear(toastRef.toastId);
                    this.performRemoveFriend(username);
                };
            }

            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    this.toastr.clear(toastRef.toastId);
                };
            }
        }, 100);
    }

    async performRemoveFriend(username: string): Promise<void> {
        const loadingToast = this.toastr.info('Eliminando amigo...', '', {
            disableTimeOut: true,
        });

        try {
            await this.apiClient.removeFriend(username);
            this.toastr.clear(loadingToast.toastId);
            this.toastr.success('Amigo eliminado correctamente');
            await this.fetchFriends();
        } catch (error) {
            console.error('Remove friend error:', error);
            this.toastr.clear(loadingToast.toastId);
            this.toastr.error('Error al eliminar amigo');
        }
    }
}
