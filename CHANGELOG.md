# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Internal Nginx Cache Routing for GitLab Runner**: Configured self-hosted GitLab CI/CD runner to route cache archiving and extraction through local Nginx reverse proxy domain (`oldsmarchaos.com` / `www.oldsmarchaos.com`) via WebDAV (`/runner-cache/`) with local host persistence at `/var/cache/gitlab-runner/`, eliminating offsite cloud calls and external network overhead.
- **Local Domain Loopback Resolution**: Added internal DNS resolution entry in `/etc/hosts` for direct loopback routing (`127.0.0.1`) with full Let's Encrypt TLS certificate validation.

## [0.1.0] - 2026-11-02

### Added
- **Synchronous 2-Player Retro Multiplayer Rooms**: Real-time room creation, custom join codes, interactive lobby, player chat, dual-ready status tracking, and unified libretro session launching for synchronized browser gameplay.
- **Multiplayer Dual-Controller & E2E Testing**: Dual physical Xbox Bluetooth controller mapping utilities and comprehensive automated integration test suite verifying end-to-end room lifecycle, bidirectional messaging, and input handling.
- **Collapsible Community Shoutbox**: Live public chat bar spanning full site width positioned above the featured hero spotlight, featuring automated announcements for newly added game releases.
- **Next.js Local CI/CD Build Caching**: Persisted `.next/cache` between pipeline runs in `.gitlab-ci.yml` to accelerate rebuild cycles and eliminate build cache warnings.
- **Multi-Asset Metadata & Media Downloader**: Unified CLI tool (`download-metadata`) integrating IGDB CDN, SteamGridDB, and TheGamesDB for 2D/3D box art, cartridge images, transparent logos, screenshots, and MP4 previews.
- **Artwork Audit & Orphan Pruning Tools**: Automated artwork verification engine and interactive pruning utility with deletion safeguards for platform default bezels and fanart.
- **Persistent Metadata Negative Cache**: Local negative cache to skip repeated API calls for exhausted or unavailable titles during bulk catalog scans.
- **Manual Mobile Save Card Trigger**: Direct save action button in the standalone mobile/tablet emulator header for cloud card synchronization.
- **Cross-Platform In-Browser Emulation**: WebGL, WebAssembly, and WebAudio support across 16 retro gaming platforms with multi-threaded cores.

### Changed
- **Full-Width Site Header**: Unconstrained global navigation bar to 100% viewport width with responsive pill collapsing and dropdown overflow handling for intermediate desktop displays.
- **Multiplayer Console Cores**: Streamlined initial multiplayer room creation core selection by removing Sega Dreamcast (`flycast`) and Sega Saturn (`yabause`/`kronos`).
- **Desktop Modal Dimensions**: Expanded game detail and emulator modal viewports to nearly fill the desktop screen (`w-[98vw]`, `h-[95-97vh]`) for optimal canvas real estate.
- **Gamepad Event Frequency**: Throttled `GamepadHandler` polling to 60Hz and neutralized continuous vibration actuators to prevent Xbox Wireless Adapter disconnects.
- **Storage Mount Hierarchy**: Migrated primary game storage pool to `/mnt/storage/oldsmarchaos.com/roms/` with backward-compatible directory fallback.

### Removed
- **Dreamcast & Saturn Netplay Cores**: Removed unsupported high-latency 3D console cores from multiplayer room selection dropdowns.
- **Legacy Play.js Runner**: Cleaned up obsolete PS2 recompilation pipeline in favor of standalone WebAssembly cores.

### Fixed
- **Shoutbox Continuous Focus**: Fixed input deactivation on message submit by preserving active focus within the chat field across submissions.
- **Chat Enter Key Scrolling**: Eliminated default textarea behavior that caused page-level vertical scroll jumping when submitting messages via the Enter key.
- **Authoritative Cloud Memory Card Sync**: Guaranteed MariaDB database virtual cards override stale desktop browser caches on boot to prevent save rollbacks.
- **Safe URI Decoding**: Replaced unhandled `decodeURIComponent` with `safeDecodeURIComponent` across scanner and route handlers to prevent crashes on titles containing literal `%` characters.
- **COEP Header Conflict**: Resolved Cross-Origin Embedder Policy header collision between Next.js server and Nginx reverse proxy.
- **GameCube Standalone Routing**: Directed GameCube titles to standalone emulator guidance and Dolphin links to prevent in-browser core fetch errors.

### Security
- **Local Cache Storage Restriction**: Enforced strict Nginx IP restrictions (`allow 127.0.0.1; allow ::1; deny all;`) on internal runner cache endpoints.
- **Vulnerability Remediation (SEC-01 through SEC-12)**: Hardened global CORS preflights, patched avatar URL scheme injection and path traversal, isolated cloud save state platform scopes, and enforced HMAC-SHA256 session signature validations.
