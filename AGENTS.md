<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Next.js 16 App Router — ROM Vault Project Guidelines

ROM Vault (https://your-domain.com/roms) is a high-performance web-based retro gaming preservation portal and in-browser emulation system built with Next.js 16 (App Router), React 19, and TypeScript. All code must strictly match the versions and conventions defined in package.json, discarding legacy patterns from Next.js 13–15.

## 1. Project Overview & Architecture
- Archive: >8,220 games across 15 retro platforms (~1.25 TB across Sony PS1/PS2, Nintendo NES–GCN, and Sega systems) paired with in-browser WebGL/WASM/WebAudio emulation, cloud-synchronized memory cards, and IGDB metadata enrichment.
- Frontend: Next.js 16 App Router, React 19, Tailwind CSS, Lucide icons, Framer Motion.
- Backend Service: Node.js 26 service running under systemd (retro-gaming.service on port 39254), reverse-proxied behind Apache/Nginx at /roms.
- Database: MariaDB (rom_vault) managed via connection pooling in `src/lib/db.ts` for user accounts, sessions, user-scoped virtual memory cards, and persistent IGDB cache (`game_metadata`).
- Filesystem & Storage: Storage pool at `/mnt/storage/roms/` (game ROMs, CHD archives, multi-layer artwork, MP4 previews) and `/storage/saves/` (raw binary virtual memory cards).

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
- HTTP 206 Partial Content: High-frequency byte-range streaming for disc images (`.chd`, `.iso`) and ROM binaries from `/mnt/storage/roms/`.
- Memory Card Binary Endpoints: Raw `.mcr` / `.srm` import and export downloads.
- Background Save Ingestion: Non-blocking target for emulator save sync queues.
- Session Auth Performance: Validate HMAC-SHA256 signed session cookies with key caching to process rapid byte-range requests with zero auth bottleneck.
- Secure Boundaries: Mark backend modules (`db.ts`, `auth/*`, `scanner.ts`) with `import "server-only"`. Keep storage mount paths and Twitch API credentials confined to the server layer.

## 8. State Mutations: Server Functions
Form Actions & Saves: Implement mutations in `"use server"` files (`src/app/actions.ts`):
- Cloud memory card slot reordering, renaming, and default slot assignment (supporting up to 5 virtual 128 KB cards per user).
- User profile updates, favorites toggles, and metadata manual override flags.
- Zero-Stutter Save Sync: Background auto-saves during emulation compute SHA-256 checksums client-side and push to save APIs via background `fetch()` queues to preserve 60 FPS WebGL/WebAudio execution without micro-stutters.
- Validation & Authorization: Validate all inputs using Zod schemas, verify session identity, and check rate/quota limits before executing DB or filesystem writes.
- Error Handling: Return structured results (`{ ok: false, error: "..." }`) instead of throwing exceptions.
- Post-Mutation Flow: Use `updateTag(tag)` for immediate client reflection, followed by `refresh()` or `redirect()` placed strictly outside try/catch blocks.

## 9. Media & Assets
- Multi-Disc Handling: Group multi-disc titles under unified parent entities with disc-index metadata; ensure UI switching triggers no full-page reloads.
- Multi-Layer Artwork: Render 2D/3D box art, cartridge media, transparent logos, and screenshots using `next/image` with explicit dimensions or fill alongside defined sizes.
- Video Previews: Deliver MP4 preview loops via standard HTML5 `<video>` tags backed by HTTP 206 streaming endpoints.
- Remote Patterns: Configure `images.remotePatterns` in `next.config.ts` for IGDB / Twitch media CDNs.

## 10. Strict Anti-Patterns ("Do Not")
- Do not use Pages Router artifacts (`getServerSideProps`, `getStaticProps`, `next/router`, or `pages/` directory).
- Do not access `params`, `searchParams`, or `cookies()` synchronously.
- Do not use `middleware.ts` (Next.js 16 requires root `proxy.ts`).
- Do not call internal Route Handlers from Server Components via fetch; invoke internal service logic directly from `src/lib/`.
- Do not leak raw database models, secret environment keys, or internal storage paths to Client Components.
- Do not call `revalidateTag(tag)` without the mandatory profile argument (e.g., `revalidateTag(tag, "max")`).
- Do not invoke `redirect()` inside try blocks.

## 11. Pre-Flight Verification
- Typecheck & Lint: Execute `tsc --noEmit` and the configured Biome/ESLint checks; ensure zero type mismatches across App Router contracts.
- Performance Profiling: Validate via `/_next/mcp` that emulation routes, media streams, and library views emit clean static shells without unexpected blocking SSR waterfalls.
- Audit Caching Tiers: Clearly annotate which segments are prerendered, cache-component accelerated (`"use cache"`), or streamed via `<Suspense>`.

