export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const startMs = Date.now();
    const { scanGameLibrary } = await import("@/lib/scanner");
    void scanGameLibrary()
      .then((res) => {
        console.log(
          `[startup] Pre-warmed ROM library cache (${res.games.length} games) in ${Date.now() - startMs}ms`
        );
      })
      .catch((err) => {
        console.error("[startup] Failed to pre-warm ROM library cache:", err);
      });
  }
}
