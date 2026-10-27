"use client";

import React, { useState } from "react";
import { Share2, Check, Copy } from "lucide-react";

interface ScoreShareButtonsProps {
  scoreId: number;
  scoreText: string;
}

export function ScoreShareButtons({ scoreId, scoreText }: ScoreShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scoreText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt("Copy score share text:", scoreText);
    }
  };

  const handleShare = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.oldsmarchaos.com";
    const shareUrl = `${origin}/roms/scores/${scoreId}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "ROM Vault High Score Record",
          text: scoreText,
          url: shareUrl,
        });
        return;
      } catch {}
    }
    await handleCopy();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white/10 hover:bg-white/20 text-white border border-white/15 transition cursor-pointer active:scale-95"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Copied to Clipboard!</span>
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 text-zinc-300" />
            <span>Copy Share Link</span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition cursor-pointer active:scale-95"
      >
        <Share2 className="w-4 h-4" />
        <span>Share Record</span>
      </button>
    </div>
  );
}
