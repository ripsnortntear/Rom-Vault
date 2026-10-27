import { ImageResponse } from "next/og";
import { getHighScoreById } from "@/lib/community";
import { getGameById } from "@/lib/scanner";

export const runtime = "nodejs";
export const alt = "ROM Vault High Score Record";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const scoreId = parseInt(id, 10);
  const score = isNaN(scoreId) ? null : await getHighScoreById(scoreId);
  const game = score ? await getGameById(score.gameId) : null;

  const gameTitle = game?.displayTitle || score?.gameId || "Retro Arcade Title";
  const systemName = (score?.system || game?.system || "RETRO").toUpperCase();
  const playerName = score?.user.displayName || score?.user.username || "Vault Player";
  const scoreDisplay = score ? score.score.toLocaleString() : "1,420,500";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 80px",
          backgroundColor: "#09090b",
          backgroundImage: "radial-gradient(circle at 50% 0%, #27153a 0%, #09090b 70%)",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          border: "8px solid #27272a",
        }}
      >
        {/* Top Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                backgroundColor: "#dc2626",
                color: "#ffffff",
                padding: "8px 18px",
                borderRadius: "12px",
                fontSize: "20px",
                fontWeight: 900,
                letterSpacing: "2px",
              }}
            >
              ROM VAULT
            </div>
            <div
              style={{
                backgroundColor: "#3f3f46",
                color: "#f4f4f5",
                padding: "8px 16px",
                borderRadius: "12px",
                fontSize: "18px",
                fontWeight: 700,
              }}
            >
              {systemName}
            </div>
          </div>
          <div style={{ fontSize: "24px", color: "#fbbf24", fontWeight: 800 }}>
            🏆 OFFICIAL VAULT RECORD
          </div>
        </div>

        {/* Center Score Hero */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "26px", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "1px" }}>
            {gameTitle}
          </div>
          <div
            style={{
              fontSize: "92px",
              fontWeight: 900,
              color: "#fbbf24",
              fontFamily: "monospace",
              textShadow: "0 0 30px rgba(251, 191, 36, 0.4)",
              letterSpacing: "-2px",
            }}
          >
            {scoreDisplay} <span style={{ fontSize: "40px", color: "#e4e4e7" }}>PTS</span>
          </div>
        </div>

        {/* Footer Player Info */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "2px solid rgba(255, 255, 255, 0.15)",
            paddingTop: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "24px",
                backgroundColor: "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
                fontWeight: 800,
              }}
            >
              {playerName.charAt(0).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: "16px", color: "#a1a1aa" }}>ACHIEVED BY</div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#ffffff" }}>
                {playerName}
              </div>
            </div>
          </div>

          <div style={{ fontSize: "18px", color: "#71717a", fontWeight: 600 }}>
            oldsmarchaos.com/roms
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
