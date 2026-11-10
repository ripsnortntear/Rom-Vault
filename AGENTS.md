<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

# Next.js 16 App Router — ROM Vault Project Guidelines

ROM Vault (https://your-domain.com/roms) is a high-performance web-based retro gaming preservation portal and in-browser emulation system built with Next.js 16 (App Router), React 19, and TypeScript. All code must strictly match the versions and conventions defined in package.json, discarding legacy patterns from Next.js 13–15.

## 1. Project Overview & Architecture
- Archive: >8,220 games across 15 retro platforms (~1.25 TB across Sony PS1/PS2, Nintendo NES–GCN, and Sega systems) paired with in-browser WebGL/WASM/WebAudio emulation, cloud-synchronized memory cards, and IGDB metadata enrichment.
- Frontend: Next.js 16 App Router, React 19, Tailwind CSS, Lucide icons, Framer Motion.
- Backend Service: Node.js 26 service running under systemd (retro-gaming.service on port 39254), reverse-proxied behind Apache/Nginx at /roms.
- Database: MariaDB (rom_vault) managed via connection pooling in `src/lib/db.ts` for user accounts, sessions, user-scoped virtual memory cards, and persistent IGDB cache (`game_metadata`).
- Filesystem & Storage: Storage pool at `/mnt/storage/oldsmarchaos.com/roms/` (game ROMs, CHD archives, multi-layer artwork, MP4 previews) and `/mnt/storage/oldsmarchaos.com/roms/saves/` (raw binary virtual memory cards).

## 2. Before You Write Code
- Read version-matched docs in `node_modules/next/dist/docs/` (`01-app/03-api-reference/`) before calling unverified APIs; strictly obey deprecation notices.
- Inspect `next.config.ts` for cacheComponents, partialPrefetching, typedRoutes, and remote image patterns configured for external media/IGDB CDN assets.
- Use the next dev MCP endpoint (`/_next/mcp`) to diagnose route compilation, hydration, and blocking-route issues iteratively.

## 3. Directory Layout & Routing Conventions
All source files reside in `src/`:
- `src/proxy.ts`: Root proxy replacing `middleware.ts` in Next.js 16. Exports `function proxy(request: NextRequest)` and `config.matcher`. Handles path rewrites under `/roms`, header hygiene, and high-throughput pre-checks. Never perform heavy database reads or treat proxy execution as sole auth enforcement.
- `src/app/`: Next.js App Router hierarchy:
  - `page.tsx` & `route.ts` are the only public entry points.
  - Colocate internal helpers in `_folders` and segment cleanly with route groups `(groups)`.
  - Core routes: Library catalog/filtering, game player view (`/play/[id]`), user profile/cloud saves, and specialized API route handlers.
- `src/components/`: Client UI modules (`RetroLibraryClient.tsx`, `FilterBar.tsx`, `GameCard.tsx`, `GameDetailModal.tsx`, `EmulatorModal.tsx`).
- `src/lib/`: Server-only infrastructure modules:
  - `db.ts`: MariaDB connection pool manager.
  - `scanner.ts`: Filesystem ROM scanner, disc grouping, and title normalization cache.
  - `igdb.ts`: Twitch OAuth manager and canonical IGDB metadata fetcher.
  - `auth/`: HMAC-SHA256 session token signer, cookie manager, and permission guards.

## 4. Server vs. Client Components
- Server Components by Default: Keep library browsing lists, metadata displays, game detail containers, and user profile wrappers as Server Components.
- Leaf Client Components (`"use client"`):
  - Apply `"use client"` only to interactive leaves: `FilterBar.tsx`, interactive modals (`GameDetailModal.tsx`), and emulator instances (`EmulatorModal.tsx` managing WASM, WebGL canvas, and WebAudio contexts).
  - Never place `"use client"` on top-level pages or layouts to mask build errors.
- Component Composition: Pass Server Components into Client Components via children or serializable props. Do not import server utilities into client boundaries.
- Serialization Boundary: Objects crossing the boundary must be strictly serializable (no raw DB connection instances, class prototypes, functions, or unformatted Date objects).
- Data Fetching: Execute database queries directly in Server Components using `await db.query(...)` wrapped with React's `cache()`. Never use client-side `useEffect` data fetching or have Server Components call local route handlers over HTTP.
- React 19 Rules of Hooks & Subcomponent Delegation:
  - Never call hooks (`useMemo`, `useCallback`, `useEffect`, `useRef`) after an early conditional return (e.g. `if (!game) return null;`).
  - If a component requires pre-checks or renders fallbacks, either replace `useMemo` with inline pure expressions or extract the hook-dependent view into a dedicated subcomponent (e.g. `StandardMobileEmulatorView`) rendered only when prerequisites are met.
  - Never assign or mutate `ref.current` directly in the component render body (e.g. `gamepadRef.current = ...`). Always defer ref synchronizations to `useEffect` or event handlers to avoid tearing in concurrent rendering.

## 5. Async Request APIs & Types
- Type all page, layout, and route handler inputs using generated global types (`PageProps<"/play/[id]">`, `RouteContext<"/api/roms/[id]/stream">`).
- `params`, `searchParams`, `cookies()`, and `headers()` are strictly async. Always await them in Server Components:
```typescript
import "server-only";
import { notFound } from "next/navigation";
import { getGameById } from "@/lib/scanner";

export default async function PlayPage(props: PageProps<"/play/[id]">) {
  const { id } = await props.params;
  const game = await getGameById(id);

  if (!game) notFound();

  return <EmulatorWrapper game={game} />;
}
```

## 6. Caching & Streaming with Cache Components
With `cacheComponents: true` active:
- Canonical IGDB & Scanner Caching: Use `"use cache"` directive on functions resolving IGDB metadata and ROM directory scans. Pair with `cacheLife("days" | "max")` from `next/cache`.
- Cache Invalidation: Use `cacheTag("metadata", `game-${id}`, "library")` to identify cached assets. Invalidate via `updateTag` or `revalidateTag(tag, "max")` upon filesystem rescan or manual metadata sync.
- Uncached & Dynamic Reads: MariaDB account queries, memory card slots, and active session lookups must sit inside a `<Suspense>` boundary with a fallback skeleton to avoid blocking the static shell prerender.
- Session/Request Isolation: Never embed `cookies()` or raw auth reads inside a broadly cached scope. Use `"use cache: private"` only when caching user-specific computations.
- Forbidden Legacy Options: Do not use `export const dynamic`, `revalidate`, `fetchCache`, `unstable_cache`, or `unstable_noStore`.

## 7. ROM Streaming, Authentication & Route Handlers
Route Handlers (`src/app/api/**/route.ts`): Reserved exclusively for non-UI data exchange:
- HTTP 206 Partial Content: High-frequency byte-range streaming for disc images (`.chd`, `.iso`) and ROM binaries from `/mnt/storage/oldsmarchaos.com/roms/`.
- Memory Card Binary Endpoints: Raw `.mcr`, `.ps2`, and `.srm` import and export downloads.
- Memory Card Specifications:
  - PS1 (DuckStation / RetroArch): 131,072 bytes (128 KB) `.mcr`, initialized with `0x00`.
  - PS2 (PCSX2 / TabStationToo): 8,650,752 bytes (8 MB + ECC) `.ps2`, initialized with `0xff`.
- Graceful Guest Fallbacks: Memory card download (`/api/users/me/cards/[id]/download`) and sync (`/api/users/me/cards/[id]/sync`) endpoints must provide guest fallback binaries rather than returning 401 errors when unauthenticated emulator iframes mount cards.
- Self-Healing Storage Paths: Database records storing physical memory card file paths (`user_memory_cards.file_path`) must implement self-healing path resolution (`resolveActualCardPath`). If a recorded path on disk does not exist, resolve the asset dynamically under the active user storage directory (`getUserMemoryCardDir`) and automatically update the database record to prevent runtime `ENOENT` card mount failures.
- Robust Emulator Iframe Save Contracts: All emulator iframes communicating save events via `postMessage` (`VAULT_FORCE_SAVE`) MUST emit a corresponding status event (`saved`, `error`, or `idle`) back to the parent window upon completion or error. The parent container (`EmulatorModal`) must enforce a safety timeout (e.g., 7–8 seconds) to prevent the user interface from hanging indefinitely in a loading state.
- Per-Game Emscripten IDBFS Isolation & PS1 Card Validation: Shared `/data/saves` IndexedDB (`IDBFS`) reads and writes in `EJS_onSaveDatabaseLoaded` MUST be strictly filtered to the active game's `candidateNames` (`filterCandidateSaveFiles`)—never iterate over or write `targetBuffer` to arbitrary `existingFiles` from other games/systems. Validate PS1 memory card buffers for exact `131,072`-byte length and Sony `"MC"` (`0x4d, 0x43`) magic header (`isValidPs1MemoryCard`), and check all 15 directory frames (`frames 1..15` at `frame * 128 !== 0xa0`, `isBlankPs1MemoryCard`) before treating a card as non-blank.
- Non-Destructive Memory Card Export & `beforeunload` Guard: Memory card exports (`Export Card`) must flush live WASM save RAM (`VAULT_EXPORT_CARD` -> `flushSaveNow()`) and trigger downloads via `Blob` + `URL.createObjectURL()` rather than bare `<a href="...?download=1">` links, and emulator views must intercept `beforeunload` in the capture phase (`e.stopImmediatePropagation()`) so attachment downloads never trigger EmulatorJS's destructive `beforeunload -> exit -> restart() -> Module.abort()` handler.
- Universal Cloud Save Sync & Database Authority: Central MariaDB table (`user_game_saves`) acts as the definitive source of truth for cross-device save states (`.state`) and native saves (`.srm`, `.sav`) across all non-PlayStation retro platforms. On session start, pre-flight pulls from `/api/saves` overwrite stale local browser cache or IndexedDB. Auto-saves push dirty state to `/api/saves`, and page unloads dispatch `navigator.sendBeacon` to `/api/saves/beacon`. The dedicated PlayStation memory card system (`/api/users/me/cards/...`, PS1 128 KB `.mcr`, PS2 8.65 MB `.ps2`) remains preserved, isolated, and untouched.
- MAME/Arcade Streaming `.zip` Extension Invariant: Arcade ROM streaming URLs (`/api/roms/[id]/stream/[fileName]`) MUST explicitly preserve the physical `.zip` filename extension (e.g., `1942.zip`). The Emscripten virtual filesystem inside Libretro MAME requires the exact `.zip` container name; stripping or omitting the extension causes MAME to inspect an uncompressed file, encounter an empty filesystem, and drop into the RetroArch fallback GUI.
- WebRTC Multiplayer & Room Lifecycle (Gambatte-GameVault): Game Boy / GBC link cable multiplayer uses WebRTC signaling endpoints (`/api/multiplayer/rooms`). Rooms must maintain active client heartbeat polling (every 15–30 seconds) and server-side sweepers to immediately prune abandoned ghost rooms and disconnected peer sessions within 90 seconds.
- Upstream Submodule Tracking & Verification (TabStationToo & Gambatte-GameVault): Upstream emulator projects are tracked as Git submodules in `vendor/` (`vendor/TabStationToo` on branch `wasm`, `vendor/Gambatte-GameVault` on branch `gamevault`). Automated synchronization and contract verification CLI scripts (`npm run sync-tabstationtoo`, `npm run verify-tabstationtoo`, `npm run sync-gambatte`, `npm run verify-gambatte`) ensure that upstream commits are checked, patched, and verified against all ROM Vault integration contracts (Asyncify, exported link functions, memory card cloud sync, and subframe unload guards).
- Background Save Ingestion: Non-blocking target for emulator save sync queues.
- Session Auth Performance: Validate HMAC-SHA256 signed session cookies with key caching to process rapid byte-range requests with zero auth bottleneck.
- Secure Boundaries: Mark backend modules (`db.ts`, `auth/*`, `scanner.ts`) with `import "server-only"`. Keep storage mount paths and Twitch API credentials confined to the server layer.

## 8. State Mutations: Server Functions
Form Actions & Saves: Implement mutations in `"use server"` files (`src/app/actions.ts`):
- Cloud memory card slot reordering, renaming, and default slot assignment (supporting up to 5 virtual cards per platform per user for PS1 and PS2).
- User profile updates, favorites toggles, and metadata manual override flags.
- Cross-Device Cloud Favorites Synchronization: User favorites must be bidirectionally synced between client-side `localStorage` (`nes_vault_favorites_v1`) and the MariaDB `user_favorites` table (`user_id`, `game_id`, `system`). On login or hydration, missing cloud favorites are merged with local favorites, ensuring desktop and mobile platforms display identical favorited games with instantaneous UI responsiveness.
- Zero-Stutter Save Sync: Background auto-saves during emulation compute SHA-256 checksums client-side and push to save APIs via background `fetch()` queues to preserve 60 FPS WebGL/WebAudio execution without micro-stutters.
- Validation & Authorization: Validate all inputs using Zod schemas, verify session identity, and check rate/quota limits before executing DB or filesystem writes.
- Error Handling: Return structured results (`{ ok: false, error: "..." }`) instead of throwing exceptions.
- Post-Mutation Flow: Use `updateTag(tag)` for immediate client reflection, followed by `refresh()` or `redirect()` placed strictly outside try/catch blocks.

## 9. Media & Assets
- Multi-Disc Handling: Group multi-disc titles under unified parent entities with disc-index metadata; ensure UI switching triggers no full-page reloads.
- Multi-Layer Artwork: Render 2D/3D box art, cartridge media, transparent logos, and screenshots using `next/image` with explicit dimensions or fill alongside defined sizes.
- Video Previews: Deliver MP4 preview loops via standard HTML5 `<video>` tags backed by HTTP 206 streaming endpoints.
- Mobile Video Invariants: All preview `<video>` elements (hero spotlights, cards, detail modals) MUST specify `playsInline` and initial `muted={isMuted}` with an overlay toggle button. Never use unmuted autoplay or default `controls` which cause mobile browsers (iOS Safari / Mobile Chrome) to hijack the viewport into native fullscreen.
- Expansive Desktop Viewports: Do not restrict game detail cards (`GameDetailModal`) or live emulator windows (`EmulatorModal`) to narrow widths (`max-w-5xl` or `max-w-6xl`) on desktop. Viewports must nearly fill the screen (`w-full md:w-[98vw] max-w-[99vw] 2xl:max-w-[1920px]` and `h-[95-97vh]`) to maximize game canvas real estate on widescreen displays.
- Remote Patterns: Configure `images.remotePatterns` in `next.config.ts` for IGDB / Twitch media CDNs.
- Media Auditing & Orphan Pruning Safeguards: Automated and manual artwork pruning operations (`prune-orphans`) must safeguard platform-wide default media (`default.png`, `default.jpg`, `default.mp4` across bezels and fanart) and multi-disc parent titles.
- Audit Report Threshold Invariant: Command-line audit tools must check report payload size—streaming directly to stdout when `<= 5 KB` (5,120 bytes), and writing to file with an executive summary table when `> 5 KB` to avoid flooding terminal buffers.
- Hero Spotlight Media Fallback Hierarchy: In hero cards and featured spotlights, preview media MUST follow a strict multi-tier fallback progression: Gameplay Video (`game.media.video`) -> In-game Screenshot (`game.media.screenshot`) -> Title Screen (`game.media.screenTitle`) -> Alternative Artwork / Fanart (`game.media.artworkFront`, `game.media.artwork3d`) -> Styled Badge Placeholder. All media tags must hook `onError` handlers to gracefully degrade forward at runtime without breaking layout or displaying empty black boxes.
- Community Asset Contribution Policies: The Contribution Center (`/roms/contribute`) enforces strict intake rules: gameplay video submissions MUST strictly be YouTube URLs (to eliminate server transcode load and bandwidth exhaustion), whereas image submissions accept direct uploads and external URLs across PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF, SVG, and AVIF (with MIME-sniffing for extensionless CDN URLs). The system selector pills bar must dynamically hide platforms that have 0 remaining missing assets.

## 10. Strict Anti-Patterns ("Do Not")
- Do not use Pages Router artifacts (`getServerSideProps`, `getStaticProps`, `next/router`, or `pages/` directory).
- Do not access `params`, `searchParams`, or `cookies()` synchronously.
- Do not use `middleware.ts` (Next.js 16 requires root `proxy.ts`).
- Do not call internal Route Handlers from Server Components via fetch; invoke internal service logic directly from `src/lib/`.
- Do not leak raw database models, secret environment keys, or internal storage paths to Client Components.
- Do not call `revalidateTag(tag)` without the mandatory profile argument (e.g., `revalidateTag(tag, "max")`).
- Do not invoke `redirect()` inside try blocks.
- Do not silence compiler, bundler, or linter warnings with suppression comments (e.g., `/*turbopackIgnore*/`, `// eslint-disable`, `@ts-ignore`) instead of fixing root causes. Diagnose the underlying architectural issue and ensure the build compiles cleanly on its own merit.
- Do not anchor external storage paths to `process.cwd()` (e.g. `path.join(process.cwd(), "storage/...")`), which misleads Turbopack static analysis into tracing the entire repository into server bundles. Keep external mount paths absolute.
- Do not use unhandled `decodeURIComponent()` on game titles or URL parameters; always use `safeDecodeURIComponent()` to prevent `URIError: URI malformed` on titles containing literal percent signs (`%`).
- Do not re-randomize or re-filter server-rendered featured items unconditionally in `useEffect` on initial client mount (e.g. `setFeaturedGame(Math.random())`), and never call `Math.random()` inside `useState()` initializers in `"use client"` components (which executes once during SSR and again with a different random value during client hydration, causing the Hero Card to flip at hydration). Always generate random seeds and initial user/header state in the Server Component (`page.tsx`) and pass them down via props, gating filter-driven client effects with a ref (e.g. `prevSystemRef`) to preserve server-rendered state and eliminate F5 double-load visual flicker and redundant media downloads.
- Do not pass `keepalive: true` to `fetch()` when uploading payloads larger than 48 KB (such as 128 KB PS1 `.mcr` or 8.65 MB PS2 `.ps2` memory cards); Chromium and Microsoft Edge enforce a hard 64 KiB (`65,536`-byte) body limit on `keepalive` requests and immediately throw `TypeError: Failed to fetch` client-side before sending any network traffic.
- Do not use bare navigation `<a href="...?download=1">` links to export memory cards while an emulator iframe is running; always use programmatic `Blob` + `URL.createObjectURL()` downloads so the browser does not fire `beforeunload` and abort the running WebAssembly core.
- Do not place React hooks after conditional early returns, and do not mutate `ref.current` during render execution.

## 11. Pre-Flight Verification
- Typecheck & Lint: Execute `tsc --noEmit` and the configured Biome/ESLint checks; ensure zero type mismatches across App Router contracts.
- ESLint Flat Config Scope (`eslint.config.mjs`): Always maintain `globalIgnores` for third-party emulator cores, vendored submodules, and generated build scripts (`public/**`, `vendor/**`, `scripts/**`). Never disable project-wide linting or add file-level `@ts-ignore` comments to silence upstream emulator bundle issues.
- Performance Profiling: Validate via `/_next/mcp` that emulation routes, media streams, and library views emit clean static shells without unexpected blocking SSR waterfalls.
- Audit Caching Tiers: Clearly annotate which segments are prerendered, cache-component accelerated (`"use cache"`), or streamed via `<Suspense>`.

## 12. Automated Repository Synchronization Invariant
- Post-Task Execution: Upon completing each logical section, feature, remediation, or refactor, you MUST execute `/var/www/html/roms/sync-repo.sh --rebuild "<descriptive commit message>"`.
- Pre-Commit Verification: The script automatically verifies the Next.js Turbopack build (`npm run build`), restarts `retro-gaming.service`, stages files, pulls with rebase, and pushes clean builds to `origin/main`.
- Never Hardcode Credentials in Scripts: Pushes must rely on standard git remote authentication or the `GIT_PUSH_URL` environment variable; never embed personal access tokens in script files.

## 13. Hermetic CI Unit Testing & Database Mocking
- Zero Live DB Dependency in Unit Tests: Unit and regression test suites (`npm test` / Vitest) must run 100% hermetically without requiring a running MariaDB socket, network connection, or live credentials.
- Top-Level Hoisted Mocks: Any test importing modules that interact with `@/lib/db` must mock the database using `vi.hoisted` and `vi.mock("@/lib/db", ...)`:
  - Case A (Active / Valid): Mock `db.query` / `query` to return valid active rows.
  - Case B (Revoked / Missing): Mock `db.query` / `query` to return empty array `[]`.
  - Case C (Suspended / Disabled): Mock `db.query` / `query` to simulate account restrictions.
- Zero Stderr Pollution: Ensure tests do not emit unhandled rejection warnings or connection error logs (`[validateSessionToken] DB verification failed`) in CI.

## 14. Privacy, Generalized Documentation & Placeholders
- Generalized Links & Domains: All documentation, wikis, `.env.example`, and deployment configuration templates must use standard RFC 2606 generalized domains (e.g., `https://your-domain.example.com`, `https://roms.example.com`) and generic email addresses (`admin@example.com`).
- Placeholder Callout Required: Any README, setup guide, or wiki file detailing installation steps MUST include a prominent notice informing users that all hostnames, storage paths (`/mnt/storage/oldsmarchaos.com/roms`), and passwords are generalized templates.
- Zero Revealing Information: Never commit personal access tokens, specific internal network IPs, real user emails, or production secrets to tracked documentation or repository code.

## 15. Proactive Remediation & Autonomous Execution Invariant
- Always Apply Fixes Proactively: When a defect, anti-pattern, race condition, or user-reported inefficiency is diagnosed, always implement the complete, end-to-end fix directly. Do not stop midway to ask if the user wants the fix applied.
- Complete Verification Before Responding: Only return to the user after all code changes, unit tests, static analysis, Next.js Turbopack builds, service restarts, and repository synchronization (`sync-repo.sh --rebuild`) have fully completed and verified.

<!-- END:nextjs-agent-rules -->