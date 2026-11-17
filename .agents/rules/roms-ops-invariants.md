---
trigger: always_on
---
# ROM Vault Operational & Proxy Invariants

1. **Next.js 16 `proxy.ts` Body Size Limit:** `src/proxy.ts` buffers request bodies up to `10 MB` by default. Any route accepting larger `FormData`/binary uploads (such as `/api/contribute/upload` at 150 MB) requires `experimental.proxyClientMaxBodySize` in `next.config.ts` (currently `"160mb"`).
2. **Nginx `COEP: credentialless` vs. Third-Party Iframes:** `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin` are required for WASM `SharedArrayBuffer` on emulator routes (`/roms`, `/roms/play`, `/roms/playjs`), but break cross-origin YouTube embeds (`refused to connect`). Exempt non-emulator routes (`/roms/contribute`, `/roms/admin`) using `location ^~` prefix blocks (not `location ~` regex, which loses to `location ^~ /roms`).
3. **MAME vs. Neo Geo (`fbneo`) & BIOS Separation:**
   - Hyper NeoGeo 64 (`snk/hng64.cpp`) titles require MAME and must stay in `mame/roms/`, not `neogeo/roms/`.
   - BIOS archives (`neogeo.zip`, `v4bios.zip`, `hng64.zip`) must remain on disk for core dependencies while being excluded from the playable catalog in `src/lib/scanner.ts`.
   - `MobileEmulatorView.tsx` must set `window.EJS_biosUrl = "/roms/api/bios/neogeo.zip?system=neogeo"` for `neogeo`.
4. **Startup Cache Pre-Warming:** `src/instrumentation.ts` pre-warms `scanGameLibrary()` on boot, paired with `inFlightScan` deduplication in `src/lib/scanner.ts` so concurrent cold-start requests share the same scan.
