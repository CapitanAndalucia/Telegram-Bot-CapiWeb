# Angular Documentation Overview

This document provides a concise overview of the key concepts, architecture, and best practices for the Angular application within this project.

## 1. Project Structure

```
src/
├── app/
│   ├── app.ts                 # Root module
│   ├── app.config.ts          # Application configuration
│   ├── app.routes.ts          # Client-side routing
│   ├── app.routes.server.ts   # Server‑side routing (SSR)
│   ├── app.config.server.ts   # SSR configuration
│   ├── guards/
│   │   └── auth.guard.ts      # Route guard for authentication
│   ├── services/
│   │   ├─ api-client.service.ts  # HTTP client wrapper
│   │   └─ security-config.service.ts  # Security config loader
│   ├── pages/
│   │   ├── main-index/        # Main landing page component
│   │   ├── tickets/           # Tickets feature
│   │   ├── api/               # API demo page
│   │   ├── portfolio/         # Portfolio components
│   │   ├── hub/               # Hub dashboard
│   │   ├── fileshare/         # File share component
│   │   └── auth/              # Authentication pages (login, register)
│   └── models/
│       └─ api-error.ts        # Error model for API responses
├── main.ts                     # Browser bootstrap
├── main.server.ts              # Server bootstrap (SSR)
└── server.ts                   # Node/Express entry point

public/
├── static/                      # Static assets served by Django backend
│   ├── portafolio/
│   │   ├── css/
│   │   ├── images/
│   │   └── icono/
└── vite.svg                     # Vite logo

vite.config.js                 # Vite configuration (build & dev)
package.json                   # Dependencies
README.md                      # Project readme
```

## 2. Key Angular Concepts Used

| Concept | Description |
|---------|-------------|
| **Modules** | `app.ts` serves as the root module; other feature modules are lazily loaded via routes. |
| **Components** | Each page in `src/app/pages/*` is a component with its own template, styles, and logic. |
| **Routing** | Client‑side routing (`app.routes.ts`) and server‑side routing (`app.routes.server.ts`) support Angular Universal (SSR). |
| **Guards** | `auth.guard.ts` protects routes that require authentication. |
| **Services** | `api-client.service.ts` wraps HTTP calls; `security-config.service.ts` loads configuration from the backend. |
| **Lazy Loading** | Feature modules are loaded on demand to keep bundle size small. |

## 3. Build & Development

- **Development Server**: `npm run dev` (Vite)
- **Production Build**: `npm run build`
- **SSR**: `node server.js` after building the production assets.

## 4. Testing

- Unit tests are located in `src/app/**/*.spec.ts`.
- Run with `npm test`.

## 5. Common Practices Followed

| Practice | Implementation |
|----------|----------------|
| **Lazy loading** | Feature modules loaded via Angular Router's `loadChildren`. |
| **Single‑source of truth for API URLs** | Configured in `security-config.service.ts` and injected into services. |
| **Guarded routes** | All protected routes use `AuthGuard`. |
| **SSR support** | Separate server entry (`main.server.ts`) and server routing configuration. |

## 6. Extending the Project

- Add a new feature: create a folder under `src/app/pages`, add component files, update routing in `app.routes.ts` (or `.server.ts` for SSR), and register any needed services.
- Update `package.json` to include new dependencies.

---

**Note:** This document is meant as a quick reference. For deeper learning, refer to the official Angular documentation: https://angular.io/docs

```