"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Gamepad2,
  Megaphone,
  Radio,
  RefreshCw,
  User,
  ShieldAlert,
  Play,
  Info,
} from "lucide-react";
import type { ShoutMessage } from "@/types/shoutbox";
import type { GameItem } from "@/types/game";

interface ShoutboxProps {
  currentUser?: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
  } | null;
  onSelectGameById?: (gameId: string) => void;
  allGames?: GameItem[];
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 20) return "just now";
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "";
  }
}

export function Shoutbox({
  currentUser,
  onSelectGameById,
  allGames = [],
}: ShoutboxProps): React.ReactElement {
  // Requirement: Default to collapsed, expand when clicking the down button on the right
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [shouts, setShouts] = useState<ShoutMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [messageInput, setMessageInput] = useState<string>("");
  const [guestName, setGuestName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("romvault_guest_name");
      if (saved) return saved;
      const rand = Math.floor(1000 + Math.random() * 9000);
      return `Guest_${rand}`;
    }
    return "Guest_1001";
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, []);

  // Fetch recent shouts
  const fetchShouts = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch("/roms/api/shoutbox", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.shouts && Array.isArray(data.shouts)) {
          setShouts(data.shouts);
        }
      }
    } catch (err) {
      console.warn("[Shoutbox] Failed to fetch shouts:", err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchShouts();
  }, [fetchShouts]);

  // Real-time polling when expanded (every 7 seconds)
  useEffect(() => {
    if (isCollapsed) return;

    // Scroll to bottom when opening
    scrollToBottom(false);

    const interval = setInterval(() => {
      fetchShouts(true);
    }, 7000);

    return () => clearInterval(interval);
  }, [isCollapsed, fetchShouts, scrollToBottom]);

  // Auto-scroll when new shouts arrive while open
  useEffect(() => {
    if (!isCollapsed && shouts.length > 0) {
      scrollToBottom(true);
    }
  }, [shouts.length, isCollapsed, scrollToBottom]);

  // Handle send message
  const handleSendMessage = async (e: React.FormEvent) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    const trimmed = messageInput.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setErrorMessage(null);

    try {
      const payload: { message: string; guestName?: string } = {
        message: trimmed,
      };

      if (!currentUser) {
        payload.guestName = guestName;
        if (typeof window !== "undefined") {
          localStorage.setItem("romvault_guest_name", guestName);
        }
      }

      const res = await fetch("/roms/api/shoutbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to post message.");
      } else {
        setMessageInput("");
        if (data.shout) {
          setShouts((prev) => [...prev, data.shout]);
        }
        setTimeout(() => {
          scrollToBottom(true);
        }, 30);
      }
    } catch (err) {
      setErrorMessage("Network error while posting shout.");
    } finally {
      setIsSending(false);
    }
  };

  const latestShout = shouts.length > 0 ? shouts[shouts.length - 1] : null;

  return (
    <section
      aria-label="Community Shoutbox"
      className="relative w-full rounded-2xl border border-white/10 bg-zinc-950/85 backdrop-blur-md shadow-2xl mb-6 overflow-hidden transition-all duration-300"
    >
      {/* Glow decorative highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />

      {/* HEADER BAR (Always visible, full width) */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 select-none bg-gradient-to-r from-zinc-900/90 via-zinc-950/95 to-zinc-900/90 border-b border-white/5">
        {/* Left Side: Brand, Live indicator, and Latest preview ticker */}
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-75" />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Radio className="w-4 h-4 text-red-500" />
            <span className="text-xs sm:text-sm font-black tracking-wider uppercase text-white">
              Vault Shoutbox
            </span>
            <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/5 text-zinc-400 border border-white/10">
              Live Feed
            </span>
          </div>

          {/* Latest shout preview when collapsed */}
          {isCollapsed && latestShout && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 border-l border-white/10 pl-3 ml-1 truncate">
              {latestShout.type === "release" ? (
                <span className="flex items-center gap-1.5 text-amber-300 font-medium truncate">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="truncate">{latestShout.message}</span>
                </span>
              ) : latestShout.type === "system" ? (
                <span className="flex items-center gap-1.5 text-cyan-300 font-medium truncate">
                  <Megaphone className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">{latestShout.message}</span>
                </span>
              ) : (
                <span className="truncate">
                  <strong className="text-zinc-200">
                    {latestShout.displayName || latestShout.username}:
                  </strong>{" "}
                  {latestShout.message}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Toggle Button with Down/Up Arrow */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsCollapsed((prev) => !prev);
              if (isCollapsed) {
                fetchShouts(true);
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white transition-all shadow-sm cursor-pointer"
            title={isCollapsed ? "Expand Shoutbox" : "Collapse Shoutbox"}
            aria-expanded={!isCollapsed}
          >
            <span className="text-[11px] sm:text-xs">
              {isCollapsed ? "Open Shoutbox" : "Collapse"}
            </span>
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4 text-emerald-400 transition-transform duration-200 animate-pulse" />
            ) : (
              <ChevronUp className="w-4 h-4 text-zinc-400 transition-transform duration-200" />
            )}
          </button>
        </div>
      </div>

      {/* EXPANDED SECTION */}
      {!isCollapsed && (
        <div className="px-4 py-4 sm:px-6 flex flex-col gap-4 bg-zinc-950/70 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Subheader info bar */}
          <div className="flex items-center justify-between text-xs text-zinc-400 pb-2 border-b border-white/5">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
              Community discussions, tips & automatic new release announcements
            </span>
            <button
              type="button"
              onClick={() => fetchShouts(false)}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition"
              title="Refresh messages"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Messages Scroll Area */}
          <div
            ref={scrollContainerRef}
            className="h-64 sm:h-72 overflow-y-auto pr-2 space-y-2.5 custom-scrollbar"
          >
            {isLoading && shouts.length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin mr-2 text-zinc-400" />
                Connecting to Vault Shoutbox...
              </div>
            ) : shouts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs text-center py-8">
                <Radio className="w-8 h-8 text-zinc-600 mb-2 opacity-50" />
                <p>No messages yet in the shoutbox.</p>
                <p className="text-zinc-600">Be the first to drop a shout below!</p>
              </div>
            ) : (
              shouts.map((shout) => {
                if (shout.type === "release") {
                  return (
                    <div
                      key={shout.id}
                      className="group relative p-3 rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-zinc-900/60 to-zinc-950/90 text-xs text-zinc-200 flex items-start gap-3 shadow-md"
                    >
                      <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0 mt-0.5">
                        <Gamepad2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-amber-500/25 text-amber-300 border border-amber-500/40">
                            NEW RELEASE
                          </span>
                          {shout.systemId && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {shout.systemId}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500 ml-auto">
                            {formatRelativeTime(shout.createdAt)}
                          </span>
                        </div>
                        <p className="text-zinc-100 font-medium leading-relaxed">
                          {shout.message}
                        </p>
                        {shout.gameId && onSelectGameById && (
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectGameById(shout.gameId!)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-amber-300 text-amber-300" />
                              <span>View & Play Game</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (shout.type === "system") {
                  return (
                    <div
                      key={shout.id}
                      className="p-3 rounded-xl border border-cyan-500/25 bg-cyan-950/20 text-xs text-zinc-200 flex items-start gap-3"
                    >
                      <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex-shrink-0 mt-0.5">
                        <Megaphone className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            SYSTEM
                          </span>
                          <span className="text-[10px] text-zinc-500 ml-auto">
                            {formatRelativeTime(shout.createdAt)}
                          </span>
                        </div>
                        <p className="text-cyan-100 leading-relaxed">{shout.message}</p>
                      </div>
                    </div>
                  );
                }

                // Regular User Shout
                const isUserAdmin = shout.role === "admin";
                const initialLetter = (shout.displayName || shout.username || "G")[0].toUpperCase();

                return (
                  <div
                    key={shout.id}
                    className="group p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors flex items-start gap-3 border border-transparent hover:border-white/5"
                  >
                    {/* User Avatar */}
                    {shout.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={shout.avatarUrl}
                        alt={shout.username}
                        className="w-7 h-7 rounded-full object-cover border border-white/10 flex-shrink-0 mt-0.5"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-600/30 to-purple-600/30 border border-white/10 flex items-center justify-center text-[11px] font-bold text-red-300 flex-shrink-0 mt-0.5">
                        {initialLetter}
                      </div>
                    )}

                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-bold text-zinc-200">
                          {shout.displayName || shout.username}
                        </span>
                        {isUserAdmin && (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-black uppercase bg-red-600/30 text-red-300 border border-red-500/40">
                            <ShieldAlert className="w-2.5 h-2.5" />
                            Admin
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500 ml-auto">
                          {formatRelativeTime(shout.createdAt)}
                        </span>
                      </div>
                      <p className="text-zinc-300 break-words leading-relaxed select-text">
                        {shout.message}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-500/30 text-red-300 text-xs">
              {errorMessage}
            </div>
          )}

          {/* INPUT FORM */}
          <form
            onSubmit={handleSendMessage}
            className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/10"
          >
            {/* Identity badge / Guest input */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {currentUser ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-300">
                  <div className="w-4 h-4 rounded-full bg-red-600/30 text-red-300 flex items-center justify-center text-[9px] font-bold">
                    {(currentUser.displayName || currentUser.username)[0].toUpperCase()}
                  </div>
                  <span className="max-w-[100px] truncate font-medium">
                    {currentUser.displayName || currentUser.username}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value.slice(0, 20))}
                    placeholder="Guest Name"
                    className="w-28 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
                    title="Change your guest display name"
                  />
                  <Link
                    href="/auth/login"
                    className="text-[10px] text-zinc-400 hover:text-white underline"
                    title="Sign in with your Vault account"
                  >
                    Sign In
                  </Link>
                </div>
              )}
            </div>

            {/* Shout Text Input */}
            <div className="relative flex-1 flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSendMessage(e);
                  }
                }}
                maxLength={280}
                placeholder={
                  currentUser
                    ? "Type a shout and press Enter..."
                    : "Type a shout as guest..."
                }
                disabled={isSending}
                className="w-full px-3 py-2 pr-16 rounded-xl bg-zinc-900/90 border border-white/10 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition"
              />
              <span className="absolute right-2.5 text-[10px] text-zinc-500 select-none">
                {280 - messageInput.length}
              </span>
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={isSending || !messageInput.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold transition shadow-md shadow-red-600/20 cursor-pointer flex-shrink-0"
            >
              {isSending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Shout</span>
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
