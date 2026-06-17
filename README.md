# UC.Comms

UC.Comms is a private chat platform split across a Node.js API server, a React / PWA web client, a Tauri desktop wrapper, and a Capacitor / Cordova mobile wrapper.

## Workspaces

| Workspace | Purpose | Main technologies | Build output |
| --- | --- | --- | --- |
| `root` | npm workspace orchestration, shared TypeScript config, root build/typecheck scripts. | npm workspaces, TypeScript config | N/A |
| `server` | Express API, Socket.IO realtime chat, authentication, invite codes, SQLite persistence, media uploads, and production serving of the built web app. | Node.js, Express, Socket.IO, better-sqlite3, bcryptjs, zod, multer, helmet, cors, rate limiting | `server/dist` |
| `web` | Browser UI and PWA. Uses the API client and Socket.IO client. During local development it proxies `/api`, `/uploads`, and `/socket.io` to `localhost:3000`. | React 19, Vite, TypeScript, `vite-plugin-pwa`, `socket.io-client` | `web/dist` |
| `desktop` | Tauri desktop shell that loads the built web app from `web/dist`. | Tauri v2, Rust/Cargo, WebView2 on Windows | `desktop/src-tauri/target` |
| `mobile` | Capacitor mobile shell that loads the built web app from `../web/dist`. Android and iOS platform projects are generated/synced from this workspace. | Capacitor 7, Android Gradle/SDK, Xcode for iOS/macOS | `mobile/android` and `mobile/ios` when synced |
| Docker files | Containerized deployment options for the combined app, server-only runtime, or nginx static web runtime. | Docker, Docker Compose | Container images |

## Prerequisites

Install these before building:

| Dependency | Used for | Minimum / notes |
| --- | --- | --- |
| Node.js | All npm workspaces | `>=20`; LTS recommended |
| npm | Workspace install/build scripts | Included with Node.js |
| Git | General repo/tooling support | Recommended |
| Python 3 | Native module builds, especially `better-sqlite3` | Python 3.8+ |
| Rust/Cargo | Desktop Tauri build | Install with `rustup` |
| Visual Studio Build Tools / C++ Build Tools | Windows native builds for Rust crates and `better-sqlite3` | Include the C++ workload |
| WebView2 Runtime | Running/building Tauri apps on Windows | Evergreen WebView2 recommended |
| Android Studio + Android SDK + JDK | Android mobile builds | Required for `npm --workspace mobile run cap:build:android` |
| Xcode | iOS/macOS mobile builds | Only on macOS |
| Docker Desktop + Docker Compose | Containerized deployment | Optional for local Docker builds |

`build.bat` checks for the common Windows dependencies and can open download pages or attempt installs with `winget` or Chocolatey.

## Local setup

1. Copy the example environment file:

   ```powershell
   copy .env.example .env
   ```

2. Edit `.env`

   Required for first production startup:

   - `ADMIN_PASSWORD` || This is required as the admin account is the first account created upon initial deployment.
   - `SESSION_SECRET` || This is for your specific deployment, it should be unique and secure, if security is a priority for your use case.

   Recommended to set:

   - `APP_BASE_URL` || Can either be localhost:port or your domain. 
   - `VITE_UC_COMMS_API_URL` || Leave blank or set it as the same domain.
   - `INVITE_CODE` || This is similar to Matrix servers, this prevents anyone who shouldn't have access from signing up.
   - `SIGNUP_DISABLED` || Another Matrix inspired feature, with this set to `true`, nobody will be able to register an account.
   - `MAX_UPLOAD` || This is the file size limit for uploading, it is set in megabytes so keep that in mind when setting it for yourself.

3. Install dependencies:

   ```powershell
   npm install --include-workspace-root
   ```

## Development

Run the server and web client in separate terminals:

```powershell
npm run dev:server
npm run dev:web
```

The Vite dev server proxies API, upload, and Socket.IO traffic to `http://localhost:3000`.

Other useful scripts:

```powershell
npm run typecheck
npm run build
npm run build:desktop
npm run build:mobile
```

## Local build script

Run this to automate everything:

```powershell
.\build.bat
```

`build.bat` defaults to building everything available on the current machine:

1. Checks common dependencies.
2. Offers to open download pages or install missing dependencies with `winget` / Chocolatey or `npm` if it is found.
3. Installs npm workspace dependencies.
4. Runs type checks.
5. Builds `web`, `server`, `desktop`, and `mobile` where supported.

Supported targets:

```powershell
.\build.bat install      # Check/install dependencies and npm packages only
.\build.bat typecheck    # Run TypeScript checks
.\build.bat web          # Build the web PWA
.\build.bat server       # Build the API server
.\build.bat desktop      # Build web, then the Tauri desktop app
.\build.bat mobile       # Build web, sync Capacitor, and build Android when available
.\build.bat all          # Same as running without arguments
```

iOS mobile builds require macOS with Xcode and is not supported by this script as I do not own any Apple devices so I cannot test it.

## Build outputs

| Command | Output |
| --- | --- |
| `npm --workspace web run build` | `web/dist` |
| `npm --workspace server run build` | `server/dist` |
| `npm --workspace desktop run build` | `desktop/src-tauri/target` |
| `npm --workspace mobile run cap:sync` | `mobile/android/app/outputs`, app-release.aab in `bundle` and app-debug.apk in `apk` |
| `npm --workspace mobile run cap:build:android` | Android Gradle build outputs under `mobile/android` |

Desktop and mobile wrappers use the built web app, so `web/dist` must exist before building them.

## Runtime configuration

The server reads configuration from environment variables. `.env.example` contains the expected names.

Important variables:

| Variable | Used by | Description |
| --- | --- | --- |
| `PORT` | Server/Docker | HTTP port. Defaults to `3000`. |
| `APP_BASE_URL` | Server | Public app URL. Used for CORS, cookies, and Socket.IO origin checks. |
| `TRUST_PROXY` | Server | Set to `true` behind a trusted reverse proxy. |
| `ADMIN_USERNAME` | Server | Initial admin username. Defaults to `admin`. |
| `ADMIN_PASSWORD` | Server | Initial admin password. Required before first admin creation. |
| `SESSION_SECRET` | Server | Required in production for session token signing. |
| `SIGNUP_DISABLED` | Server | Defaults to `true`; set to `false` to allow open registration. |
| `INVITE_CODE` | Server | Optional invite code for invite-only registration. |
| `MAX_UPLOAD_MB` | Server/Web UI | Maximum media upload size. |
| `DATA_DIR` | Server | Directory for SQLite database and uploads. Defaults to `data/`. |
| `VITE_UC_COMMS_API_URL` | Web build | API base URL baked into the web build. Leave unset for same-origin/proxied local dev. |
| `UC_COMMS_URL` | Example config | Public app URL alias used by the example environment file. |
| `API_BACKEND_URL` | Web Docker image | Nginx runtime API backend URL for the static web container. |

Data is stored in `data/uc-comms.sqlite` and `data/uploads` by default.

## Deploying

### Docker Compose all-in-one deployment

The root `docker-compose.yml` builds the combined server/web image from `Dockerfile`.

```powershell
copy .env.example .env
# Edit .env, especially ADMIN_PASSWORD, SESSION_SECRET, APP_BASE_URL, and VITE_UC_COMMS_API_URL.
docker compose up --build -d
docker compose logs -f uc-comms
```

Compose mounts persistent data in the `uc-comms-data` volume.

Useful Compose variables:

```dotenv
PORT=3000
NODE_ENV=production
APP_BASE_URL=https://comms.example.com
TRUST_PROXY=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-password
SESSION_SECRET=replace-with-a-long-random-secret
SIGNUP_DISABLED=true
INVITE_CODE=replace-with-your-unique-invite-code
VITE_UC_COMMS_API_URL=https://comms.example.com
```

Stop and remove the Compose stack:

```powershell
docker compose down
```

Remove the persistent data volume too:

```powershell
docker compose down -v
```

### Server-only Docker image

Build and run the server image:

```powershell
docker build -f server/Dockerfile -t uc-comms-server .
docker run --env-file .env -p 3000:3000 -v uc-comms-data:/app/data uc-comms-server
```

This image serves the built web app from `web/dist` and stores data under `/app/data`.

### Static web Docker image

Build the nginx web image with the API URL baked into the client:

```powershell
docker build -f web/Dockerfile ^
  --build-arg VITE_UC_COMMS_API_URL=https://comms.example.com ^
  -t uc-comms-web .
```

Run it and point it at the backend:

```powershell
docker run -p 8080:80 -e API_BACKEND_URL=https://comms.example.com uc-comms-web
```

### Manual production deployment

```powershell
npm ci --include-workspace-root
npm run build
```

Then start the production server with production environment variables:

```powershell
set NODE_ENV=production
set SESSION_SECRET=replace-with-a-long-random-secret
set ADMIN_PASSWORD=replace-with-a-strong-password
npm --workspace server run start
```

## Troubleshooting

- `better-sqlite3` fails to install or build: install Python 3 and Visual Studio Build Tools with the C++ workload, then rerun `npm ci`.
- Tauri desktop build fails: install Rust/Cargo, WebView2 Runtime, and Visual Studio C++ Build Tools.
- Mobile `cap sync` fails: build `web/dist` first with `npm --workspace web run build`, then ensure Android Studio/SDK is installed.
- Web API calls go to the wrong backend: set `VITE_UC_COMMS_API_URL` before rebuilding `web`.
- Cookies do not work behind HTTPS/proxy: set `APP_BASE_URL` to the public HTTPS URL and `TRUST_PROXY=true` when behind a trusted proxy.
