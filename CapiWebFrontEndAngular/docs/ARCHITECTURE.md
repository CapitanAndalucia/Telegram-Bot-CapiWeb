# CapiWebFrontEndAngular – Arquitectura y Componentes

Este documento describe la arquitectura del frontend Angular, los componentes disponibles y su función dentro del producto. Sirve como guía rápida para desarrolladores que necesiten comprender la distribución del código, relaciones entre módulos y puntos clave del estado interno.

## Índice

1. [Estructura general del proyecto](#estructura-general-del-proyecto)
2. [Servicios compartidos](#servicios-compartidos)
   - [ApiClientService](#apiclientservice)
3. [Módulos y componentes](#modulos-y-componentes)
   - [Área Fileshare](#area-fileshare)
     - FileshareComponent
     - FriendListComponent
     - FileUploadComponent
     - IncomingFilesComponent
     - FilePreviewModalComponent
     - NotificationCenterComponent
     - UserIconComponent
   - [Autenticación](#autenticacion)
     - AuthComponent
     - LoginComponent
     - RegisterComponent
   - [Tickets](#tickets)
   - [Portfolio](#portfolio)
     - PortfolioCurriculumComponent
     - PortfolioArteComponent
     - ViceCityBackgroundComponent
   - [Hub principal](#hub-principal)
   - [Otros componentes estáticos](#otros-componentes-estaticos)
4. [Convenciones de estilo y señales reactivas](#convenciones-de-estilo-y-senales-reactivas)
5. [Próximos pasos sugeridos](#proximos-pasos-sugeridos)

---

## Estructura general del proyecto

El proyecto adopta Angular 17 con componentes *standalone*. Todos los componentes importan `CommonModule` y, cuando corresponde, módulos adicionales específicos (por ejemplo, `FormsModule` para formularios). La estructura principal está organizada por páginas (`src/app/pages/...`) y cada página puede contener subcomponentes.

- `src/app/pages/` – páginas de alto nivel vinculadas a rutas.
- `src/app/services/` – servicios compartidos.
- `src/app/models/` – modelos TypeScript (por ejemplo, `api-error`).
- `src/app/pages/fileshare/components/` – subcomponentes del módulo de compartición de archivos.

Las señales (`signal`, `input`, `output`, `computed`, `effect`) se utilizan ampliamente para la reactividad en lugar de `BehaviorSubject` o `@Input()` clásicos.

---

## Servicios compartidos

### ApiClientService
- **Archivo**: `src/app/services/api-client.service.ts`
- **Responsabilidad**: encapsular llamadas HTTP al backend Django (autenticación, tickets, transferencias de archivos, carpetas, notificaciones, amistades, etc.).
- **Abstracción**: método privado `request<T>` centraliza la creación de requests, gestionando headers, `withCredentials` y captura de errores (`handleError`).
- **Características destacadas**:
  - Manejo de rutas base configurable (`DEFAULT_BASE_URL` o `window.__API_BASE_URL`).
  - Métodos agrupados por dominio (auth, dibujos, tickets, transfers, folders, notifications).
  - Soporte para `FormData` en cargas (`uploadFile`) y movimientos de archivos.
  - Reintentos manuales no implementados; la gestión de errores se delega a los consumidores mediante `catchError` y `ToastrService`.

> **Nota**: Al introducir nuevos endpoints, preferir añadir métodos aquí para mantener centralizada la lógica HTTP.

---

## Módulos y Componentes

### Área Fileshare

#### FileshareComponent
- **Archivo**: `src/app/pages/fileshare/fileshare.component.ts`
- **Selector**: `app-fileshare`
- **Importa**: `FriendListComponent`, `FileUploadComponent`, `IncomingFilesComponent`, `NotificationCenterComponent`, `UserIconComponent`.
- **Rol**: pantalla principal del centro de archivos.
  - Maneja pestañas "Mis Archivos" y "Enviar Archivo" con `signal` (`activeTab`).
  - Obtiene el usuario autenticado (`fetchUser`) llamando a `apiClient.checkAuth()`.
  - Coordina estado global: usuario, selección de receptor, refresco de listas (`refreshTrigger`) y toggle de sidebar en mobile.
  - Escucha eventos de subcomponentes (`onUnreadCountChange`, `onRecipientChange`).

#### FriendListComponent
- **Archivo**: `src/app/pages/fileshare/components/friend-list/friend-list.component.ts`
- **Selector**: `app-friend-list`
- **Responsabilidad**: buscar, listar y seleccionar amigos para enviar archivos.
  - Usa `signals` para listas, búsqueda y menús.
  - Integra `Subject` con `debounceTime` para el autocompletado.
  - Emite evento `selectFriend` cuando el usuario elige destinatario.
  - Invoca métodos de `ApiClientService` para CRUD de amistades (`listFriends`, `searchUsers`, `sendFriendRequest`, `removeFriend`).
  - Maneja `ToastrService` para feedback de usuario.
  - Implementa listener global para cerrar el dropdown al hacer clic fuera (`setupClickOutsideListener`).

#### FileUploadComponent
- **Archivo**: `src/app/pages/fileshare/components/file-upload/file-upload.component.ts`
- **Selector**: `app-file-upload`
- **Responsabilidad**: formulario para enviar archivos a amigos o a uno mismo.
  - Inputs reactivos: `user`, `selectedRecipient`.
  - Signals: `file`, `recipient`, `description`, `uploading`, etc.
  - Efecto que sincroniza `selectedRecipient` con el formulario.
  - Emite `uploadSuccess` y `recipientChange` al finalizar.
  - Envía `FormData` con archivo, descripción y destinatario a `apiClient.uploadFile`.
  - Resetea estado tras éxito, incluyendo el `<input type="file">`.

#### IncomingFilesComponent
- **Archivo**: `src/app/pages/fileshare/components/incoming-files/incoming-files.component.ts`
- **Selector**: `app-incoming-files`
- **Responsabilidad**: listados, navegación y acciones sobre archivos recibidos.
  - Señales principales: `files`, `folders`, `currentFolder`, `breadcrumbs`, `viewMode`, `isDragging`.
  - Navegación jerárquica de carpetas con breadcrumbs reactivos.
  - Soporta drag & drop interno: mover archivos entre carpetas, resaltar destinos (carpetas y breadcrumbs), mover mediante menú contextual o modal.
  - `fetchFiles()` y `fetchFolders()` consumen `ApiClientService` con soporte para respuestas paginadas (`results`).
  - Manejo de vista previa (`selectedFile` y `FilePreviewModalComponent`).
  0. Integración con `ToastrService` para mostrar progreso al subir, mover o eliminar.
  - Genera `FormData` para uploads, incluye `folder_id` si se está en una carpeta.
  - Funciones auxiliares: `normalizeFolderResponse`, `fetchFolderTree`, `buildMoveOptions`, `createDragPreview`.
  - Eventos notables: `handleDrop`, `handleFileDrop`, `handleBreadcrumbDrop`, `openMoveDialog`.

#### FilePreviewModalComponent
- **Archivo**: `src/app/pages/fileshare/components/file-preview-modal/file-preview-modal.component.ts`
- **Responsabilidad**: mostrar modal con previsualización de archivos (imágenes u otros).
  - Inputs: `file` (detalles de transferencia).
  - Outputs: `close`, `download`, `delete` para interactuar con el padre.
  - Gestiona cierre y accesibilidad del modal.

#### NotificationCenterComponent
- **Archivo**: `src/app/pages/fileshare/components/notification-center/notification-center.component.ts`
- **Responsabilidad**: dropdown con notificaciones y solicitudes de amistad.
  - Señales: `notifications`, `requests`, `isOpen`.
  - Carga datos con `fetchData` (paraleliza notificaciones y solicitudes).
  - Expone `totalCount` para badges en la UI.

#### UserIconComponent
- **Archivo**: `src/app/pages/fileshare/components/user-icon/user-icon.component.ts`
- **Responsabilidad**: mostrar avatar del usuario y menú contextual (logout/login/register).
  - Input: `user` (puede ser `null`).
  - Output: `logout` (evento hacia `FileshareComponent`).
  - Ofrece navegaciones rápidas a rutas de autenticación utilizando `Router`.

### Autenticación

#### AuthComponent
- **Archivo**: `src/app/pages/auth/auth.component.ts`
- **Responsabilidad**: base para login/registro con lógica compartida.
  - Inputs configurables: `initialMode`, `redirectPath`, `customTitle`.
  - Usa `signals` para estado del formulario y `computed` para metadatos (textos UI, título, fuerza de contraseña).
  - Métodos clave: `handleSubmit`, `calculatePasswordStrength`, `updateForm`.
  - Interactúa con `ApiClientService.login/register` y maneja `ApiError`.
  - Redirige tras éxito usando `Router`.

#### LoginComponent / RegisterComponent
- **Archivos**: `src/app/pages/auth/login.component.ts`, `src/app/pages/auth/register.component.ts`
- **Responsabilidad**: contenedores ligeros que inyectan `AuthComponent` con modo inicial (login o registro) y leen parámetros de la ruta (`redirect`, `title`).

### Tickets

#### TicketsComponent
- **Archivo**: `src/app/pages/tickets/tickets.component.ts`
- **Stand-alone**: `selector` `app-tickets`.
- **Responsabilidad**: CRUD de tickets con filtros de fecha y moneda.
  - Inyecta `ApiClientService`, `Router` y `ChangeDetectorRef`.
  - Controla estado de autenticación (`authStatus`) y redirige a `/tickets/login` si el usuario no está autenticado.
  - Métodos principales: `init`, `loadTickets`, `applyFilters`, `clearFilters`, `openModal`, `closeModal`, `handleSubmit`, `handleDelete`, `handleLogout`.
  - Uso extensivo de `subscribe` para manejar respuestas HTTP y forzar detección de cambios (`cdr.detectChanges()`).
  - Helpers de formato: `toLocalInput`, `formatDate`, `formatCurrency`.

### Portfolio

#### PortfolioCurriculumComponent
- **Archivo**: `src/app/pages/portfolio/portfolio-curriculum.component.ts`
- **Responsabilidad**: vista de CV/experiencia (contenido estático personalizable).
  - Usa señales para animaciones y detección de scroll.
  - Gestiona `loadMore` para listar proyectos o estudios.

#### PortfolioArteComponent
- **Archivo**: `src/app/pages/portfolio/portfolio-arte.component.ts`
- **Responsabilidad**: mostrar obras artísticas con paginación y lightbox.
  - Señales y estados: `drawings`, `currentPage`, `hasMore`, `loading`, `lightboxOpen`, `lightboxImage`.
  - Métodos clave: `loadDrawings`, `openLightbox`, `closeLightbox`, `handleLightboxClick`.
  - Usa `ApiClientService` para consumir `listDibujos` y gestionar paginado (`next` en API).

#### ViceCityBackgroundComponent
- **Archivo**: `src/app/pages/portfolio/vice-city-background.component.ts`
- **Responsabilidad**: componente decorativo con animaciones y fondo temático.
  - Implementa `AfterViewInit` para iniciar efectos visuales (gradientes animados, glow).

### Hub principal

#### HubComponent
- **Archivo**: `src/app/pages/hub/hub.component.ts`
- **Responsabilidad**: landing central que enlaza a Portfolio, API, Tickets y Fileshare.
  - Define tarjetas (`apps`) con título, descripción, ícono y ruta.
  - Usa animaciones Angular (`trigger`, `stagger`) para entrada.
  - Maneja efecto de "mouse tracking" sobre tarjetas mediante `handleMouseMove`.
  - Navega con `Router.navigate`.

### Otros componentes estáticos

#### ApiComponent
- **Archivo**: `src/app/pages/api/api.component.ts`
- **Responsabilidad**: placeholder para la documentación de la API (migración pendiente desde la versión React).

#### MainIndexComponent
- **Archivo**: `src/app/pages/main-index/main-index.component.ts`
- **Responsabilidad**: vista índice temporal que recuerda migración pendiente desde React.

---

## Convenciones de estilo y señales reactivas

- Se utiliza la API de señales introducida en Angular 16+ (`signal`, `input`, `output`, `computed`, `effect`).
- Los estilos compartidos del módulo Fileshare residen en `fileshare.component.css` y son reutilizados por subcomponentes mediante `styleUrls`.
- Para drag & drop, se mezcla la API de `DataTransfer` con `signals` para mantener el estado de carpetas y breadcrumbs resaltados y mostrar un `dragPreview` personalizado.
- `ToastrService` (`ngx-toastr`) provee feedback visual consistente.
- Los componentes usan tipado explícito para modelos (`Ticket`, `FileItem`, `Folder`, etc.) alineando frontend y backend.

---

## Próximos pasos sugeridos

1. Documentar componentes HTML/CSS con capturas de pantalla o wireframes para facilitar onboarding visual.
2. Consolidar estilos comunes en temas reutilizables (por ejemplo, separar variables en `:root`).
3. Añadir secciones de pruebas unitarias/e2e en este documento cuando existan specs relevantes.
4. Generar documentación automática (Compodoc) como complemento a esta guía manual.

---

> **Última actualización:** 28 de noviembre de 2025
