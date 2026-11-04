# Changelog

All notable changes to the ROM Vault project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **IGDB Keyword & Thematic Search Tags**: Added `keywords` column to MariaDB `game_metadata` and updated metadata downloaders (`scripts/download-metadata.mjs`, `src/lib/igdb.ts`) to ingest IGDB keywords and themes directly into `game.tags`. Games can now be found by conceptual search terms (e.g., "golf", "skateboarding", "tennis", "zombies") even if those terms do not appear in the game's title or description.
- **Full Database Keyword Backfill**: Created `scripts/backfill-keywords.mjs` (`npm run sync-keywords`) and enriched 6,463 catalog titles in MariaDB with canonical IGDB keywords and themes.
- **Search Matching Across Metadata Fields**: Expanded search filtering across genres, developer, publisher, and tags in `RetroLibraryClient.tsx`.

---

## [0.1.1] - 2026-11-03

### Added
- **Live CRT Shaders & PS1 32-Bit TrueColor Rendering Presets**: Integrated real-time Libretro/EmulatorJS WebGL CRT shader switcher (`crt-aperture`, `crt-geom`, `crt-mattias`, `crt-lottes`, `crt-easymode`, `sabre`, `bicubic`) in the desktop (`EmulatorModal.tsx`) and mobile/standalone (`MobileEmulatorView.tsx`) emulator headers with persistent `localStorage` preference (`rom_vault_crt_shader`), paired with automatic Beetle PSX (`mednafen_psx_hw`) 32bpp TrueColor (`cdrom` color depth + `dither_mode = disabled`) and N64 `4:3` aspect ratio (`mupen64plus-aspect`) overrides to eliminate 15-bit PS1 color banding and checkerboard dithering (`738c2f9`).
- **Hero Spotlight Media Fallback Chain**: Updated `HeroSpotlight` to implement a multi-tier fallback progression: if no gameplay preview video is available or if video playback fails, it falls back to in-game screenshot (`screenshot`), then title screen (`screenTitle`), and finally to alternative screenshot/fanart/boxart (`artworkFront`/`artwork3d`) with automatic runtime `onError` recovery (`c5877f1`).
- **Universal Cross-Device Save Synchronization & Database Authority**: Implemented a unified cloud save synchronization system where game save states (`.state`) and native saved games (`.srm`, `.sav`) across all non-PlayStation retro platforms seamlessly follow the user between mobile and desktop devices (`5ce8835`).
- **Authoritative Database Source of Truth**: Central MariaDB table `user_game_saves` serves as the absolute, definitive "final word" on session start, pulling authoritative save states from MariaDB before WebAssembly emulator initialization to overwrite stale local browser cache or IndexedDB records (`5ce8835`).
- **Universal Save Endpoints & Emergency Beacon Persistence**: Deployed `/api/saves` for Base64 and binary octet-stream fetch/upsert operations with SHA-256 integrity verification, alongside `/api/saves/beacon` for background `navigator.sendBeacon` emergency save persistence when users close tabs or navigate away abruptly (`5ce8835`).
- **Client SaveSyncService & EmulatorContainer**: Implemented `SaveSyncService` utility and unified `EmulatorContainer` wrapper managing pre-flight cloud pulls, virtual file system injection, debounced periodic cloud auto-saving (60s), and graceful exit flushes (`5ce8835`).
- **PlayStation Memory Card Preservation & Validation Helpers**: Preserved dedicated PS1 128 KB `.mcr` (`/api/users/me/cards/...`) and PS2 8.65 MB `.ps2` memory card infrastructures, adding strict 131,072-byte Sony `"MC"` magic header validation (`isValidPs1MemoryCard`), 15-frame directory inspection (`isBlankPs1MemoryCard`), and per-game candidate filename filtering (`filterCandidateSaveFiles`) in `src/lib/sync-service.ts` (`5ce8835`, `e460a1a`).

### Changed
- **Architectural Guidelines & Invariants (`AGENTS.md`)**: Codified Hero Spotlight fallback hierarchy, per-game Emscripten IDBFS save isolation, non-destructive `Blob` memory card exports, Chromium 64 KiB `keepalive` upload limits, and deterministic SSR/client hydration seed and header props (`9e8642e`, `54ab2b5`, `637a674`, `fab523d`).
- **CI Build Cache WebDAV Routing & GitHub Mirror**: Routed `.next` build cache through the local Nginx WebDAV proxy and mirrored pushes to `github/main` (`4746180`).

### Fixed
- **Deterministic SSR & Client Hydration (Hero Card Flip & Header Pill Pop-In)**: Generated `initialSeed = Math.random()`, `initialUser` (via `getCurrentSession()`), and `initialUserAgent` (via `headers()`) in the Server Component (`src/app/page.tsx`) and passed them into `RetroLibraryClient.tsx` and `ServerUserAgentContext` (`useBrowserEnvironment.ts`), removing client-side `Math.random()` inside `useState()` initializers and post-mount `/api/auth/me` header pop-ins so the Hero Card and header pills (Admin, User Profile, Edge Acceleration) render identically on the very first SSR frame without flipping at hydration (`9e8642e`, `637a674`).
- **PS1 Memory Card 64 KiB `keepalive` Upload Failure (`Save Error` Flashing in Edge/Chromium)**: Removed `keepalive: true` from 128 KB PS1 memory card `PUT /roms/api/users/me/cards/[id]/sync` requests (which exceeded Chromium/Edge's hard 64 KiB `keepalive` body limit and threw `TypeError: Failed to fetch` client-side) and ignored blank-card directory probes on game "Continue" screens until a non-blank save exists (`65befa8`).
- **Per-Game Emscripten `/data/saves` (`IDBFS`) Save Isolation & Endless Cloud Sync Loop**: Scoped `EJS_onSaveDatabaseLoaded` reads and writes strictly to the active game's `candidateNames` (`filterCandidateSaveFiles`), purged corrupted non-128KB `.srm` files from shared `/data/saves` IndexedDB, seeded `lastSaveHashRef` upon initial cloud card hydration so boot does not trigger a redundant cloud upload loop, and added an 8-second safety timeout on `"saving"` status in `EmulatorModal.tsx` (`e460a1a`).
- **Emulator Crash on "Export Card" Click**: Replaced bare `<a href="...?download=1">` navigation links with a live WASM save flush (`VAULT_EXPORT_CARD` -> `flushSaveNow()`) and programmatic `Blob` + `URL.createObjectURL()` download in `EmulatorModal.tsx`, paired with a capture-phase `beforeunload` interceptor (`e.stopImmediatePropagation()`) in `MobileEmulatorView.tsx` so file downloads never trigger EmulatorJS's destructive `beforeunload -> exit -> restart() -> Module.abort()` teardown (`e460a1a`).

---

## [0.1.0] - 2026-11-02

### Added
- **Comprehensive Admin Script & Automation Control Panel**: Implemented interactive Admin Panel dashboard (`/admin/scripts`) and backend process manager (`/api/admin/scripts`) to execute all repository maintenance tools via clickable UI controls with real-time stdout/stderr streaming terminal logs, background execution persistence, asset target toggles, system filtering, orphan pruning safeguards, TabStationToo upstream verification, and Git repository synchronization.
- **TabStationToo Submodule Tracking & Upstream Sync**: Configured upstream Git submodule tracking for `https://github.com/TabStationToo/TabStationToo` (`wasm` branch) at `vendor/TabStationToo`, with automated synchronization CLI tool (`npm run sync-tabstationtoo`), contract integrity verification (`npm run verify-tabstationtoo`), and CI/CD build cycle integration preserving all ROM Vault controller shields, cloud memory card synchronization, and subframe unload guards.
- **Internal Nginx Cache Routing for GitLab Runner**: Configured self-hosted GitLab CI/CD runner to route cache archiving and extraction requests through the internal Nginx reverse proxy endpoint (`your-domain.example.com`) via WebDAV (`/runner-cache/`) with local host persistence at `/var/cache/gitlab-runner/`, eliminating external cloud dependencies and upstream proxy body limits.
- **Local Domain Loopback Resolution**: Added internal DNS resolution entry in `/etc/hosts` for direct loopback routing (`127.0.0.1`) with full Let's Encrypt TLS certificate verification.
- **Synchronous 2-Player Retro Multiplayer Rooms**: Real-time room creation, custom join codes, interactive lobby, player chat, dual-ready status tracking, and unified libretro session launching for synchronized browser gameplay (`9e8d39a`).
- **Multiplayer Dual-Controller & E2E Testing**: Dual physical Xbox Bluetooth controller mapping utilities and comprehensive automated integration test suite verifying end-to-end room lifecycle, bidirectional messaging, and input handling (`ed8637b`).
- **Collapsible Community Shoutbox**: Live public chat bar spanning full site width positioned above the featured hero spotlight, featuring automated announcements for newly added game releases (`dfb879f`, `cca4e1c`).
- **Next.js Local CI/CD Build Caching**: Persisted `.next/cache` between pipeline runs in `.gitlab-ci.yml` to accelerate rebuild cycles and eliminate build cache warnings (`3222fcb`, `f86bf46`).
- **Persistent Metadata Negative Cache**: Local negative cache to skip repeated API calls for exhausted or unavailable titles during bulk catalog scans (`8fc5238`).

### Changed
- **Full-Width Site Header**: Unconstrained global navigation bar to 100% viewport width with responsive pill collapsing and dropdown overflow handling for intermediate desktop displays (`e21f962`).
- **Multiplayer Console Cores**: Streamlined initial multiplayer room creation core selection by removing Sega Dreamcast (`flycast`) and Sega Saturn (`yabause`/`kronos`) (`432cab2`).

### Fixed
- **Tabstationtoo (PS2) Reload Loops & Screen Flickering**: Memoized `playerUrl` and eliminated dynamic timestamp cache-busting (`_t=${Date.now()}`) from the emulator iframe URL in `EmulatorModal.tsx` and `PS2EmulatorView.tsx`, preventing state updates (such as save status changes or gamepad polling) from regenerating the iframe source and destroying the WebAssembly/WebGPU runtime context (`ea76cf1`).
- **Memory Card Auto-Save Debouncing & Hash Deduplication**: Implemented debouncing (3.5s quiet window, 10s minimum auto-save interval) and rapid stepped FNV-1a buffer content hashing (`quickCardHash`) on the 8.65 MB virtual memory card in `public/tabstationtoo/app.js`, coalescing consecutive writes and skipping redundant 8.65 MB uploads when card data has not changed.
- **Suppressed Browser Data Loss Warnings in Embedded Iframes**: Gated the window `beforeunload` event listener and prompt in `public/tabstationtoo/app.js` when running inside an embedded iframe (`window.self !== window.top`), preventing Microsoft Edge from popping up native data loss alert dialogs during in-game saves or normal navigation.
- **Shoutbox Continuous Focus**: Fixed input deactivation on message submit by preserving active focus within the chat field across submissions (`0432559`).
- **Chat Enter Key Scrolling**: Eliminated default textarea behavior that caused page-level vertical scroll jumping when submitting messages via the Enter key (`66ac737`).

### Security
- **Local Cache Storage Restriction**: Enforced strict Nginx IP restrictions (`allow 127.0.0.1; allow ::1; allow 10.0.0.0/8; allow 192.168.0.0/16; deny all;`) on internal runner cache endpoints.

---

## [0.0.5] - 2026-11-01

### Added
- **Cross-Platform In-Browser Emulation**: WebGL, WebAssembly, and WebAudio support across 16 retro gaming platforms with multi-threaded cores and desktop/mobile guardrails (`f2a6bc2`).
- **Multi-Asset Metadata & Media Downloader**: Unified CLI tool (`download-metadata`) integrating IGDB CDN, SteamGridDB, and TheGamesDB for 2D/3D box art, cartridge images, transparent logos, screenshots, and MP4 previews (`0332640`, `815be1c`, `fb857ad`, `46d9f4c`).
- **Artwork Audit & Orphan Pruning Tools**: Automated artwork verification engine (`c50ad10`) and interactive pruning utility (`c1f7e02`) with deletion safeguards for platform default bezels and fanart.
- **Community Contribution Exporter**: Added export utilities and documentation guidelines for community-contributed artwork and metadata assets (`3ed6284`).
- **Bulk Metadata Sync Engine**: Rate-limited IGDB catalog synchronization tool for bulk archive enrichment (`760d4f5`).
- **Manual Library Rescan**: Added authenticated manual library rescan via UI button and CLI (`npm run scan`) (`c9d98ef`).
- **Storage Pool Migration**: Migrated primary game storage pool to `/path/to/roms` with backward-compatible directory fallback (`fb6cdce`).
- **Edge Browser Recommendation**: Added conditional COOP/COEP detection and Edge browser guidance banner with hardware acceleration tips (`dca2ab4`, `7d4228a`).
- **Manual Mobile Save Card Trigger**: Direct save action button in the standalone mobile/tablet emulator header for cloud card synchronization (`c929bb8`).

### Changed
- **Gamepad Event Frequency**: Throttled `GamepadHandler` polling to 60Hz and neutralized continuous vibration actuators to prevent Xbox Wireless Adapter disconnects (`e6911fb`, `28d41bc`, `eb364e6`).
- **Guidelines & Architectural Invariants**: Persisted rules on warnings, storage path anchoring, and safe URI decoding into `AGENTS.md` (`b318260`, `2f96f4b`).

### Fixed
- **Authoritative Cloud Memory Card Sync**: Guaranteed MariaDB database virtual cards override stale desktop browser caches on boot to prevent save rollbacks (`4223f34`).
- **PS2 Cloud Card Resolution**: Fixed cloud card synchronization and added error feedback and guest fallback handling (`54cd52c`).
- **Turbopack Dynamic Path Tracing**: Resolved root cause of dynamic filesystem tracing warnings in memory card modules (`70a1548`, `7c122e9`, `ebdfef4`).
- **Safe URI Decoding**: Replaced unhandled `decodeURIComponent` with `safeDecodeURIComponent` across scanner and route handlers to prevent crashes on titles with `%` characters (`60bb8e5`).
- **Z-Index Layering**: Elevated header and Edge recommendation badge z-index above the featured hero card (`0449e57`).

---

## [0.0.4] - 2026-10-31

### Added
- **TabStationToo In-Browser PS2 Emulation**: Integrated PCSX2-based WebGPU/WASM emulator runner with automated SCPH-39001 BIOS loading, disc streaming, and gamepad support (`0307ece`, `7308803`, `d57f06a`).
- **PS2 Virtual Memory Cards**: Cloud-synchronized 8MB `.ps2` memory card management with slot allocation and TabStationToo auto-loading (`9354646`).
- **Standalone GameCube Emulation**: Enabled GameCube and Dreamcast browser emulation with fallback Dolphin routing (`ce901d4`, `58d35a0`).
- **Comprehensive Wiki & Documentation**: Hardened setup guides, generalized domain documentation (RFC 2606), and privacy compliance (`7a1bdf8`).
- **Learned Architectural Rules**: Persisted CI/CD sync, unit testing, and privacy rules 12-14 into `AGENTS.md` (`b61c211`, `f7a65ef`).

### Changed
- **Modal Viewport Expansion**: Expanded game detail and emulator modal viewports to nearly fill the desktop screen (`w-[98vw]`, `h-[95-97vh]`) (`048ee53`).
- **Platform Mobile Policies**: Enforced desktop-only emulation for resource-intensive consoles (PS2, GameCube, Dreamcast) (`e49e1bb`).
- **Game Boy Core Bundling**: Mapped GBC and SGB systems to Gambatte core with local WASM data bundling (`898c903`).

### Removed
- **Play.js PS2 Runner**: Removed legacy Play.js emulator and compilation pipeline in favor of TabStationToo (`fdfbef9`).

### Fixed
- **Gamepad Actuator Disconnects**: Throttled polling to 60Hz and neutralized vibration actuators in TabStationToo to stop Chrome gamepad drops (`8c948c9`).
- **COEP Header Conflict**: Resolved Cross-Origin Embedder Policy header collision between Next.js and Nginx allowing cross-origin iframes (`f4e7949`).
- **Mobile Video Autoplay Hijack**: Configured inline playback with mute toggle on mobile game cards to prevent native fullscreen hijacking (`345ef5f`).
- **Bidirectional Cloud Card Sync**: Linked PS1 MariaDB memory cards bidirectionally across desktop and mobile (`3d9d91d`).
- **Range Fetch Authentication**: Passed credentials in range fetches for authenticated disc streaming (`c146ed0`).

### Security
- **Vulnerability Remediation (SEC-01 - SEC-12)**:
  - Hardened global CORS preflights and origin whitelisting (`00ae55a`).
  - Patched avatar image URL scheme injection and path traversal (`e1229c1`).
  - Isolated cloud save state platform scopes and prevented cross-tenant access (`3296412`).
  - Addressed input validation, auth bypass risks, and CSRF protections (`1a791ea`, `a6d611b`).
- **CI/CD Security Scanning**: Added GitLab SAST security scanning integration in `.gitlab-ci.yml` (`1a55f57`, `c2bf5fd`).

---

## [0.0.3] - 2026-10-30

### Added
- **Passive Gamepad Status Badges**: Added visual controller connection status indicators in the top navigation bar and footer (`bbef4c4`).
- **Play! PS2 Standalone WASM Integration**: Preliminary standalone WASM PS2 runner with ROM streaming integration (`b7055b1`, `2ffa0d8`).

### Fixed
- **Mobile Emulator Rendering**: Preserved React hook ordering in `PS2EmulatorView` on mobile devices (`9f65140`).
- **Streaming Quota & Filename Mismatches**: Resolved `%20` filename encoding mismatches and eliminated keepalive 64KB connection drops (`29a688c`).
- **Saves Route Fallback**: Added fallback to game-specific saves route and included credentials in card fetches (`c0de241`).
- **Hydration Warning Suppression**: Added `suppressHydrationWarning` to dynamic server/client date and card status strings (`728fd12`).
- **Gamepad Outer Polling**: Disabled redundant outer modal polling to enforce standard controller profiles (`929c7d0`).

---

## [0.0.2] - 2026-10-29

### Added
- **Automated Continuous Deployment**: Enabled automated GitLab CI/CD deployment pipeline to `retro-gaming.service` via `rsync` (`1bfb25a`).
- **Cloud PS1 Card Sync on Mobile**: Integrated cloud PS1 memory card download and sync in `MobileEmulatorView` (`f27e592`).
- **Random Game Selector**: Added completely random featured game selection for catalog discovery (`bd04ab5`).

### Changed
- **CI/CD Pipeline Optimization**: Replaced heavy Docker analyzer templates with native shell build, explicit devDependencies, and typecheck steps (`f098ef3`, `0cb2f0e`, `ba4733c`).

### Fixed
- **Physical Gamepad Analog Mapping**: Bridged physical left analog stick axes to digital D-pad keys and injected runtime analog mapping in `EJS_onGameStart` (`e185c59`, `7e2e41d`, `41d8614`, `2d3b27b`).
- **Mobile Player Viewport & CHD Stability**: Moved play button above the fold, resolved `%2520` URL double-encoding, stabilized CHD compression loading, and centered controls (`5bd7cf5`, `c45e3e9`).
- **Binary Save Buffer Compatibility**: Wrapped binary memory card save buffers in `Blob` objects for fetch `BodyInit` compatibility (`88b2fd1`).
- **CI Build Dynamic Routes**: Marked root, admin, and profile routes `force-dynamic` to bypass build-time database connection requirements (`4cdfdb8`, `ec3ef79`, `d3a6522`, `8578e01`).
- **Deployment File Permissions**: Dropped timestamp, owner, and group preservation in deployment `rsync` to eliminate `EPERM` and `chgrp` errors (`8610aff`, `5812d69`).

---

## [0.0.1] - 2026-10-27

### Added
- **Initial ROM Vault Architecture**: High-performance retro preservation portal built with Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS (`0cde702`, `18abd6a`).
- **In-Browser Emulation Engine**: WebGL and WASM emulation supporting multi-disc PS1 games with disc grouping and title normalization.
- **Fast-Path Zero-DB Auth**: High-throughput HMAC-SHA256 signed session cookie manager with zero database bottleneck on rapid range requests (`4c1c8ce`).
- **Cloud Virtual Memory Cards**: Multi-slot cloud memory card synchronization and binary export/import for PS1.
- **Mobile Player Route**: Dedicated standalone mobile player route (`/play/[id]`) with low-memory WebGL rendering and custom touch overlays (`6561be8`).
- **Virtual Gamepad Controls**: Dedicated styled virtual shoulder buttons (L1/L2, R1/R2) and touch D-pad for mobile emulation (`d14d44e`).
- **Physical Gamepad DualShock Mapping**: Dynamic PS1 controller mapping with analog stick mirroring (`2d32c06`).
- **Community Suite**: User profiles, leaderboards, game detail modal, comments feed, and admin management tools (`1a137cd`, `950c2a3`, `d8827da`).

### Fixed
- **Gamepad Haptic Collision**: Fixed strict-mode property assignment collisions on `GamepadHapticActuator` and added error boundaries (`510adfe`).
- **Controller Power-Down Prevention**: Neutralized aggressive vibration power-downs and injected synchronous gamepad sanitization (`aa3d498`, `380c656`).
- **Emulator Pre-Launch Stability**: Resolved premature `play()` call crashes, centered overlays, and bundled local EmulatorJS assets and translations (`7513e09`, ed2b6ee, d34604a).
- **Multi-Disc Mobile Emulation**: Resolved mobile crashes and stabilized URL filter persistence on multi-disc PS1 titles (`6788e9e`).

### Security
- **Two-Stage Authentication Guards**: Enforced strict route guards in `proxy.ts` with 307 login redirects and 403 role authorizations (`a67211d`).
- **Domain & Secret Sanitization**: Sanitized internal hostnames and secrets into generic RFC 2606 templates (`fd9d6a6`).
- **Secret Detection**: Integrated automated secret detection in `.gitlab-ci.yml` (`2c21778`).
