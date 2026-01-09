# Documentación de la API - CapiWeb

Esta documentación describe todos los endpoints de la API REST del backend y cómo interactuar con ellos desde el frontend Angular.

---

## Autenticación

El sistema utiliza autenticación JWT mediante cookies HTTP-only. Las cookies se establecen automáticamente tras un login exitoso.

### Endpoints de Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register/` | Registra un nuevo usuario |
| POST | `/api/auth/login/` | Inicia sesión |
| POST | `/api/auth/logout/` | Cierra sesión (elimina cookies) |
| POST | `/api/auth/refresh/` | Refresca el token de acceso |
| GET | `/api/auth/check/` | Verifica si el usuario está autenticado |

### Ejemplo de uso (Frontend)

```typescript
// Login
await this.apiClient.login({ username: 'usuario', password: 'contraseña' });

// Verificar autenticación
const user = await this.apiClient.checkAuth();

// Logout
await this.apiClient.logout();
```

---

## Gestión de Archivos (Transfers)

### FileTransferViewSet

Gestiona archivos en el sistema de transferencias.

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/transfers/` | Lista archivos del usuario |
| POST | `/api/transfers/` | Sube un nuevo archivo |
| GET | `/api/transfers/{id}/` | Obtiene metadatos de un archivo |
| PATCH | `/api/transfers/{id}/` | Actualiza archivo (ej: renombrar) |
| DELETE | `/api/transfers/{id}/` | Elimina un archivo |
| GET | `/api/transfers/{id}/download/` | Descarga el archivo |
| GET | `/api/transfers/{id}/thumbnail/` | Obtiene miniatura |
| POST | `/api/transfers/{id}/mark_viewed/` | Marca como visto |
| DELETE | `/api/transfers/{id}/delete_file/` | Elimina archivo y fichero físico |

#### Parámetros de Query (GET lista)

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| scope | string | 'mine', 'shared', 'sent' - Filtra por tipo de acceso |
| folder | number\|null | ID de carpeta o 'null' para raíz |

#### Ejemplo de uso (Frontend)

```typescript
// Listar archivos en una carpeta
const files = await this.apiClient.listFiles(folderId, 'mine');

// Subir archivo con progreso
await this.apiClient.uploadFile(formData, (progress) => {
    console.log(`${progress.loaded}/${progress.total}`);
});

// Descargar archivo
const blob = await this.apiClient.downloadFile(fileId);

// Renombrar archivo
await this.apiClient.renameFile(fileId, 'nuevo_nombre.pdf');
```

### FolderViewSet

Gestiona carpetas en el sistema de archivos.

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/folders/` | Lista carpetas del usuario |
| POST | `/api/folders/` | Crea una nueva carpeta |
| GET | `/api/folders/{id}/` | Obtiene una carpeta |
| PATCH | `/api/folders/{id}/` | Actualiza carpeta (ej: renombrar) |
| DELETE | `/api/folders/{id}/delete_folder/` | Elimina carpeta recursivamente |
| GET | `/api/folders/{id}/download/` | Descarga como ZIP |
| POST | `/api/folders/{id}/mark_contents_viewed/` | Marca contenido como visto |

#### Gestión de Permisos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/folders/{id}/access/` | Lista permisos de acceso |
| POST | `/api/folders/{id}/access/` | Otorga acceso a usuario |
| DELETE | `/api/folders/{id}/access/{user_id}/` | Revoca acceso |

#### Ejemplo de uso (Frontend)

```typescript
// Crear carpeta
await this.apiClient.createFolder('Nueva Carpeta', parentId);

// Compartir carpeta con otro usuario
await this.apiClient.shareFolder(folderId, 'username', 'edit', true);

// Descargar carpeta como ZIP
const blob = await this.apiClient.downloadFolder(folderId);
```

---

## Sistema de Permisos

### Niveles de Permiso

| Permiso | Descripción |
|---------|-------------|
| `read` | Solo puede ver y descargar |
| `edit` | Puede modificar, eliminar, gestionar accesos |

### Herencia de Permisos

- Cuando se crea una subcarpeta, hereda los permisos de la carpeta padre
- Cuando se sube un archivo a una carpeta compartida, hereda los permisos
- El propietario original siempre mantiene permisos completos

---

## Enlaces Compartidos (Share Links)

Permite compartir archivos/carpetas mediante URLs únicas.

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/share-links/` | Crea enlace compartido |
| GET | `/api/share-links/for-item/` | Lista enlaces de un item |
| DELETE | `/api/share-links/{id}/` | Revoca enlace |
| GET | `/api/share-links/{token}/access/` | Accede mediante token |

#### Tipos de Acceso

| Tipo | Descripción |
|------|-------------|
| `anyone` | Cualquiera con el enlace puede acceder |
| `user` | Solo un usuario específico puede acceder |

#### Ejemplo de uso (Frontend)

```typescript
// Crear enlace público
await this.apiClient.createShareLink({
    file: fileId,
    access_type: 'anyone',
    permission: 'read'
});

// Acceder a enlace compartido
const data = await this.apiClient.accessShareLink(token);
```

---

## Tickets (Gastos)

Gestión de tickets de gastos del usuario.

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/tickets/` | Lista tickets del usuario |
| POST | `/api/tickets/` | Crea nuevo ticket |
| GET | `/api/tickets/{id}/` | Obtiene un ticket |
| PUT | `/api/tickets/{id}/` | Actualiza ticket |
| DELETE | `/api/tickets/{id}/` | Elimina ticket |
| GET | `/api/tickets/total_entre_fechas/` | Suma de gastos entre fechas |

#### Filtros (GET lista)

| Parámetro | Descripción |
|-----------|-------------|
| `fecha__gte` | Fecha mínima (YYYY-MM-DD) |
| `fecha__lte` | Fecha máxima (YYYY-MM-DD) |
| `ordering` | Campo de ordenamiento (default: `-fecha`) |

#### Ejemplo de uso (Frontend)

```typescript
// Listar tickets
const tickets = await this.apiClient.listTickets({ 
    fecha__gte: '2024-01-01',
    ordering: '-fecha' 
}).toPromise();

// Total entre fechas
const total = await this.apiClient.totalTicketsEntreFechas('2024-01-01', '2024-12-31').toPromise();
```

---

## Sistema Social

### Amigos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/friends/` | Lista amigos |
| GET | `/api/friends/search_users/` | Busca usuarios |
| POST | `/api/friends/send_request/` | Envía solicitud de amistad |
| POST | `/api/friends/remove_friend/` | Elimina amigo |
| GET | `/api/friends/requests/` | Lista solicitudes pendientes |
| POST | `/api/friends/{id}/accept_request/` | Acepta solicitud |
| POST | `/api/friends/{id}/reject_request/` | Rechaza solicitud |

#### Ejemplo de uso (Frontend)

```typescript
// Buscar usuarios
const users = await this.apiClient.searchUsers('juan');

// Enviar solicitud
await this.apiClient.sendFriendRequest('username');

// Aceptar solicitud
await this.apiClient.acceptFriendRequest(requestId);
```

---

## Notificaciones

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/notifications/` | Lista notificaciones |
| POST | `/api/notifications/{id}/mark_read/` | Marca como leída |
| POST | `/api/notifications/mark_all_read/` | Marca todas como leídas |

#### Ejemplo de uso (Frontend)

```typescript
// Listar notificaciones
const notifications = await this.apiClient.listNotifications();

// Marcar todas como leídas
await this.apiClient.markAllNotificationsRead();
```

---

## Portfolio

### Dibujos (Galería de Arte)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/dibujos/` | Lista dibujos |
| POST | `/api/dibujos/` | Crea dibujo (multipart) |
| GET | `/api/dibujos/{id}/` | Obtiene dibujo |
| PUT | `/api/dibujos/{id}/` | Actualiza dibujo |
| DELETE | `/api/dibujos/{id}/` | Elimina dibujo |

### Proyectos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/proyectos/` | Lista proyectos |
| GET | `/api/proyectos/{id}/` | Obtiene proyecto |

### Tecnologías

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/tecnologias/` | Lista tecnologías |
| GET | `/api/tecnologias/{id}/` | Obtiene tecnología |

---

## Modelos de Datos

### FileTransfer

```typescript
interface FileTransfer {
    id: number;
    uploader: number;
    uploader_username: string;
    owner: number;
    owner_username: string;
    file: string;           // URL del archivo
    filename: string;
    size: number;           // Bytes
    description?: string;
    folder?: number;
    created_at: string;
    expires_at?: string;
    is_downloaded: boolean;
    is_viewed: boolean;
    has_thumbnail: boolean;
}
```

### Folder

```typescript
interface Folder {
    id: number;
    name: string;
    owner: number;
    owner_username: string;
    uploader?: number;
    uploader_username?: string;
    parent?: number;
    created_at: string;
    has_new_content: boolean;
}
```

### User

```typescript
interface User {
    id: number;
    username: string;
    email?: string;
    telegram_id?: number;
    is_staff?: boolean;
    profile_picture_url?: string;
    has_google?: boolean;
    google_email?: string;
    has_password?: boolean;
}
```

---

## Manejo de Errores

El frontend transforma todos los errores HTTP en objetos `ApiError`:

```typescript
class ApiError {
    message: string;    // Mensaje de error legible
    status: number;     // Código HTTP
    payload?: any;      // Datos adicionales del error
}
```

### Códigos de Error Comunes

| Código | Significado |
|--------|-------------|
| 400 | Datos inválidos |
| 401 | No autenticado |
| 403 | Sin permisos |
| 404 | No encontrado |
| 500 | Error del servidor |

---

## Seguridad

### Subida de Archivos

1. **Validación de extensión**: Solo se permiten extensiones configuradas
2. **Límite de tamaño**: Configurable por GB
3. **Rate limiting**: Cooldown entre subidas (mayor para archivos grandes)
4. **Escaneo de malware**: ClamAV si está disponible
5. **Detección de ejecutables**: En archivos comprimidos

### Configuración

Los parámetros de seguridad se cargan desde `security_config.json` en el backend.
