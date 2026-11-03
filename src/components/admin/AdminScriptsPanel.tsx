"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Image as ImageIcon,
  Trash2,
  Search,
  GitBranch,
  RefreshCw,
  Download,
  FileText,
  Sliders,
  ShieldCheck,
  HardDrive,
  Copy,
  ChevronDown,
  Box,
  Layers,
  Sparkles,
} from "lucide-react";

interface TaskSummary {
  id: string;
  type: string;
  title: string;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
}

const CONSOLE_SYSTEMS = [
  { id: "all", label: "All Systems (Entire Archive)" },
  { id: "ps2", label: "Sony PlayStation 2 (PS2)" },
  { id: "psx", label: "Sony PlayStation (PS1)" },
  { id: "gamecube", label: "Nintendo GameCube (GCN)" },
  { id: "dreamcast", label: "Sega Dreamcast" },
  { id: "saturn", label: "Sega Saturn" },
  { id: "n64", label: "Nintendo 64" },
  { id: "snes", label: "Super Nintendo (SNES)" },
  { id: "nes", label: "Nintendo Entertainment System (NES)" },
  { id: "gba", label: "Game Boy Advance (GBA)" },
  { id: "gbc", label: "Game Boy Color (GBC)" },
  { id: "gb", label: "Game Boy (GB)" },
  { id: "sgb", label: "Super Game Boy (SGB)" },
  { id: "genesis", label: "Sega Genesis / Mega Drive" },
  { id: "sega32x", label: "Sega 32X" },
  { id: "sms", label: "Sega Master System" },
  { id: "sgg", label: "Sega Game Gear" },
];

const ASSET_TYPES = [
  { id: "all", label: "All Media Types", desc: "Download all missing artwork in one combined pass" },
  { id: "boxart", label: "2D Front Box Covers", desc: "Front cover packaging from IGDB / Libretro" },
  { id: "boxart-3d", label: "3D Perspective Covers", desc: "High-resolution 3D angled box art" },
  { id: "screenshots", label: "In-Game Action Shots", desc: "720p gameplay screenshots" },
  { id: "titlescreens", label: "Title / Start Screens", desc: "Authentic intro title screens" },
  { id: "disc", label: "Cartridge / Disc Media", desc: "Physical cartridge and disc face art" },
  { id: "logos", label: "Clear Wheel Logos", desc: "Transparent vector logos via SteamGridDB" },
  { id: "stories", label: "Game Plot Overviews", desc: "Summaries and storylines saved to MariaDB" },
  { id: "videos", label: "MP4 Preview Loops", desc: "High-speed video gameplay previews" },
];

export function AdminScriptsPanel() {
  const [activeTab, setActiveTab] = useState<"metadata" | "audit" | "orphans" | "upstream" | "scan">("metadata");

  // Metadata Form State
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["all"]);
  const [metaSystem, setMetaSystem] = useState("all");
  const [metaFilter, setMetaFilter] = useState("");
  const [metaLimit, setMetaLimit] = useState("");
  const [metaForce, setMetaForce] = useState(false);
  const [metaNoCache, setMetaNoCache] = useState(false);
  const [metaClearCache, setMetaClearCache] = useState(false);

  // Audit Form State
  const [auditSystem, setAuditSystem] = useState("all");
  const [auditMissingOnly, setAuditMissingOnly] = useState(false);
  const [auditNoOrphans, setAuditNoOrphans] = useState(false);
  const [auditOutput, setAuditOutput] = useState("");

  // Orphan Form State
  const [orphanSystem, setOrphanSystem] = useState("all");
  const [orphanFilter, setOrphanFilter] = useState("");
  const [orphanDryRun, setOrphanDryRun] = useState(true);
  const [orphanYes, setOrphanYes] = useState(true);

  // Git / Upstream Form State
  const [repoCommitMsg, setRepoCommitMsg] = useState("");
  const [repoRebuild, setRepoRebuild] = useState(false);

  // Execution & Live Log Console State
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTaskTitle, setActiveTaskTitle] = useState<string>("");
  const [taskStatus, setTaskStatus] = useState<"idle" | "running" | "completed" | "failed" | "cancelled">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [recentTasks, setRecentTasks] = useState<TaskSummary[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const logOffsetRef = useRef<number>(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Fetch initial task state on mount
  const checkInitialTasks = useCallback(async () => {
    try {
      const res = await fetch("/roms/api/admin/scripts");
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        setRecentTasks(data.tasks || []);
        if (data.activeTaskId) {
          setActiveTaskId(data.activeTaskId);
          setTaskStatus("running");
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    checkInitialTasks();
  }, [checkInitialTasks]);

  // Poll task logs
  const pollTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(
        `/roms/api/admin/scripts?taskId=${encodeURIComponent(taskId)}&offset=${logOffsetRef.current}`
      );
      if (!res.ok) return;
      const data = await res.json();

      if (data.ok && data.task) {
        const { task } = data;
        setActiveTaskTitle(task.title || "Admin Task");
        setTaskStatus(task.status);

        if (Array.isArray(task.logs) && task.logs.length > 0) {
          setLogs((prev) => [...prev, ...task.logs]);
          logOffsetRef.current = task.totalLogs;
        }

        if (task.status !== "running") {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          checkInitialTasks();
        }
      }
    } catch {}
  }, [checkInitialTasks]);

  useEffect(() => {
    if (!activeTaskId || taskStatus !== "running") {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(() => {
      pollTask(activeTaskId);
    }, 750);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [activeTaskId, taskStatus, pollTask]);

  const startTask = async (payload: any) => {
    setActionError(null);
    setLogs([]);
    logOffsetRef.current = 0;
    setTaskStatus("running");

    try {
      const res = await fetch("/roms/api/admin/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTaskStatus("failed");
        setActionError(data.error || `Execution failed with HTTP ${res.status}`);
        return;
      }

      setActiveTaskId(data.taskId);
      setActiveTaskTitle(data.title);
      // Trigger immediate first poll
      pollTask(data.taskId);
    } catch (err: any) {
      setTaskStatus("failed");
      setActionError(err.message || "Failed to start administrative task.");
    }
  };

  const cancelActiveTask = async () => {
    if (!activeTaskId || taskStatus !== "running") return;
    try {
      await fetch(`/roms/api/admin/scripts?taskId=${encodeURIComponent(activeTaskId)}`, {
        method: "DELETE",
      });
      pollTask(activeTaskId);
    } catch {}
  };

  const toggleAsset = (assetId: string) => {
    if (assetId === "all") {
      setSelectedAssets(["all"]);
      return;
    }
    const filtered = selectedAssets.filter((a) => a !== "all");
    if (filtered.includes(assetId)) {
      const next = filtered.filter((a) => a !== assetId);
      setSelectedAssets(next.length ? next : ["all"]);
    } else {
      setSelectedAssets([...filtered, assetId]);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-zinc-950 border border-white/10 rounded-2xl overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("metadata")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === "metadata"
              ? "bg-red-600 text-white shadow-lg shadow-red-600/30"
              : "text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Artwork &amp; Metadata Engine</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === "audit"
              ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
              : "text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audits &amp; Contributions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("orphans")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === "orphans"
              ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30"
              : "text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Trash2 className="w-4 h-4" />
          <span>Orphan Artwork Cleanup</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("upstream")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === "upstream"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
              : "text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <GitBranch className="w-4 h-4" />
          <span>Upstream &amp; Git Sync</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("scan")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === "scan"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
              : "text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Library Scanner</span>
        </button>
      </div>

      {/* Error Alert Banner */}
      {actionError && (
        <div className="p-4 rounded-2xl bg-red-950/80 border border-red-500/50 flex items-center justify-between gap-4 text-red-200 text-xs">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: Artwork & Metadata Downloader */}
      {activeTab === "metadata" && (
        <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-red-500" />
              <span>Multi-Asset Downloader &amp; IGDB Metadata Engine</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Select specific media types or target console systems to scrape authentic 2D/3D box art, logos, screenshots, and videos.
            </p>
          </div>

          {/* Asset Selection Grid */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Target Asset Types
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ASSET_TYPES.map((asset) => {
                const isSelected = selectedAssets.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggleAsset(asset.id)}
                    className={`flex flex-col text-left p-3 rounded-2xl border transition cursor-pointer ${
                      isSelected
                        ? "bg-red-950/60 border-red-500 text-white shadow-lg shadow-red-950/40"
                        : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white">{asset.label}</span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                          isSelected
                            ? "bg-red-500 border-red-400 text-white"
                            : "border-zinc-700 bg-zinc-800"
                        }`}
                      >
                        {isSelected && "✓"}
                      </div>
                    </div>
                    <span className="text-[11px] text-zinc-400 mt-1">{asset.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* System & Filtering Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-300">Target System</label>
              <select
                value={metaSystem}
                onChange={(e) => setMetaSystem(e.target.value)}
                className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              >
                {CONSOLE_SYSTEMS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-300">Title / Search Filter (Optional)</label>
              <input
                type="text"
                value={metaFilter}
                onChange={(e) => setMetaFilter(e.target.value)}
                placeholder="e.g. Spider-Man, Crash, Zelda"
                className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-300">Item Limit (Optional)</label>
              <input
                type="number"
                value={metaLimit}
                onChange={(e) => setMetaLimit(e.target.value)}
                placeholder="e.g. 50 (blank for all)"
                className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Advanced Toggles */}
          <div className="flex flex-wrap items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={metaForce}
                onChange={(e) => setMetaForce(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-red-600 focus:ring-0"
              />
              <span>Force Re-download (Overwrite existing artwork)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={metaNoCache}
                onChange={(e) => setMetaNoCache(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-red-600 focus:ring-0"
              />
              <span>Bypass Negative Cache</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={metaClearCache}
                onChange={(e) => setMetaClearCache(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-red-600 focus:ring-0"
              />
              <span>Clear Negative Cache on Run</span>
            </label>
          </div>

          {/* Action Trigger */}
          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <span className="text-[11px] text-zinc-500">
              Runs in background using rate-limited API queues. Safe to navigate away.
            </span>
            <button
              type="button"
              disabled={taskStatus === "running"}
              onClick={() =>
                startTask({
                  type: "metadata",
                  assets: selectedAssets,
                  system: metaSystem,
                  filter: metaFilter,
                  limit: metaLimit,
                  force: metaForce,
                  noCache: metaNoCache,
                  clearCache: metaClearCache,
                })
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 active:scale-95 disabled:opacity-50 text-white shadow-xl shadow-red-600/30 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Execute Metadata Download</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: Audits & Contributions */}
      {activeTab === "audit" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Artwork Audit */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-400" />
                  <span>Artwork Coverage Audit</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Audit ROM files against artwork libraries to generate statistical summaries of missing media.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-zinc-300">Target System</label>
                  <select
                    value={auditSystem}
                    onChange={(e) => setAuditSystem(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {CONSOLE_SYSTEMS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-zinc-300">Output Report File (Optional)</label>
                  <input
                    type="text"
                    value={auditOutput}
                    onChange={(e) => setAuditOutput(e.target.value)}
                    placeholder="audit-report.txt"
                    className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
                    <input
                      type="checkbox"
                      checked={auditMissingOnly}
                      onChange={(e) => setAuditMissingOnly(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-purple-600 focus:ring-0"
                    />
                    <span>Only list games with missing media in breakdown</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
                    <input
                      type="checkbox"
                      checked={auditNoOrphans}
                      onChange={(e) => setAuditNoOrphans(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-purple-600 focus:ring-0"
                    />
                    <span>Skip orphan artwork detection</span>
                  </label>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={taskStatus === "running"}
              onClick={() =>
                startTask({
                  type: "audit",
                  system: auditSystem,
                  missingOnly: auditMissingOnly,
                  noOrphans: auditNoOrphans,
                  output: auditOutput,
                })
              }
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 active:scale-95 disabled:opacity-50 text-white shadow-xl shadow-purple-600/30 transition cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>Run Artwork Audit</span>
            </button>
          </div>

          {/* Card 2: Export Community Contributions */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Box className="w-5 h-5 text-blue-400" />
                  <span>Community Contributions Exporter</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Package unique local artwork into the contributions archive with direct upstream submission URLs.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 text-xs text-zinc-400 leading-relaxed">
                <span className="font-bold text-zinc-200 block mb-1">Standardized Contribution Format:</span>
                Exports all manually curated box covers, wheel logos, and bezels organized into zip archives ready for sharing with the preservation community.
              </div>
            </div>

            <button
              type="button"
              disabled={taskStatus === "running"}
              onClick={() =>
                startTask({
                  type: "export_contributions",
                  system: auditSystem,
                })
              }
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white shadow-xl shadow-blue-600/30 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Contributions Package</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: Orphan Artwork Cleanup */}
      {activeTab === "orphans" && (
        <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2.5">
              <Trash2 className="w-5 h-5 text-amber-500" />
              <span>Orphan Artwork Pruning &amp; Cleanup Suite</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Identify and delete leftover artwork files whose parent ROM binaries have been removed or renamed.
            </p>
          </div>

          {/* Safeguard Notice */}
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Automated Safeguards Active:</span>
              <span>
                Platform-wide default bezels and fanart (<code>default.png</code>, <code>default.jpg</code>, <code>default.mp4</code>) and multi-disc parent titles are strictly protected from deletion.
              </span>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-300">Target System</label>
              <select
                value={orphanSystem}
                onChange={(e) => setOrphanSystem(e.target.value)}
                className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {CONSOLE_SYSTEMS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-300">Search Filter (Optional)</label>
              <input
                type="text"
                value={orphanFilter}
                onChange={(e) => setOrphanFilter(e.target.value)}
                placeholder="Filter by deleted title (e.g. Spider-Man)"
                className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={orphanDryRun}
                onChange={(e) => setOrphanDryRun(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-amber-600 focus:ring-0"
              />
              <span className="font-bold text-amber-400">Dry Run (Preview deletions without modifying files)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={orphanYes}
                onChange={(e) => setOrphanYes(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-amber-600 focus:ring-0"
              />
              <span>Non-interactive mode (Skip [Y/N] terminal prompt)</span>
            </label>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <span className="text-[11px] text-zinc-500">
              Tip: Run a Dry Run first to review what files would be affected.
            </span>
            <button
              type="button"
              disabled={taskStatus === "running"}
              onClick={() =>
                startTask({
                  type: "prune_orphans",
                  system: orphanSystem,
                  filter: orphanFilter,
                  dryRun: orphanDryRun,
                  yes: orphanYes,
                })
              }
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50 text-white shadow-xl transition cursor-pointer ${
                orphanDryRun
                  ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/30"
                  : "bg-red-600 hover:bg-red-500 shadow-red-600/30"
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>{orphanDryRun ? "Run Orphan Preview (Dry Run)" : "Permanently Prune Orphans"}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: Upstream & Git Sync */}
      {activeTab === "upstream" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: TabStationToo Submodule */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-blue-400" />
                  <span>TabStationToo PS2 Control Center</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Manage the integrated WebAssembly PS2 emulator submodule tracking <code>TabStationToo/TabStationToo:wasm</code>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Submodule Path:</span>
                  <span className="font-mono text-zinc-200">vendor/TabStationToo</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Tracked Branch:</span>
                  <span className="font-mono text-blue-400 font-bold">wasm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Integrity Contracts:</span>
                  <span className="text-emerald-400 font-bold">Guarded</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={taskStatus === "running"}
                onClick={() =>
                  startTask({
                    type: "tabstationtoo",
                    action: "verify",
                  })
                }
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Verify Integration Contracts</span>
              </button>

              <button
                type="button"
                disabled={taskStatus === "running"}
                onClick={() =>
                  startTask({
                    type: "tabstationtoo",
                    action: "check",
                  })
                }
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                <Search className="w-4 h-4 text-amber-400" />
                <span>Check Upstream Remote Commits</span>
              </button>

              <button
                type="button"
                disabled={taskStatus === "running"}
                onClick={() =>
                  startTask({
                    type: "tabstationtoo",
                    action: "sync",
                  })
                }
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 active:scale-95 text-white shadow-xl shadow-blue-600/30 transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Pull &amp; Sync Upstream WebAssembly</span>
              </button>
            </div>
          </div>

          {/* Card 2: Git Repository & Submodule Sync */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-emerald-400" />
                  <span>Repository Synchronization</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Trigger automated repository synchronization (<code>sync-repo.sh</code>) to pull, rebase, initialize submodules, and push.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-zinc-300">Commit Message (Optional)</label>
                  <input
                    type="text"
                    value={repoCommitMsg}
                    onChange={(e) => setRepoCommitMsg(e.target.value)}
                    placeholder="Automated maintenance sync"
                    className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none pt-2">
                  <input
                    type="checkbox"
                    checked={repoRebuild}
                    onChange={(e) => setRepoRebuild(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-0"
                  />
                  <span>Run Turbopack Build &amp; Restart Systemd Service (<code>--rebuild</code>)</span>
                </label>
              </div>
            </div>

            <button
              type="button"
              disabled={taskStatus === "running"}
              onClick={() =>
                startTask({
                  type: "sync_repo",
                  commitMessage: repoCommitMsg,
                  rebuild: repoRebuild,
                })
              }
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white shadow-xl shadow-emerald-600/30 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Execute Repository Sync</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: Library Scanner */}
      {activeTab === "scan" && (
        <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col justify-between gap-6">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2.5">
              <HardDrive className="w-5 h-5 text-emerald-500" />
              <span>Filesystem ROM Library Scanner</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Scans <code>/mnt/storage/roms</code> to index new ROMs, update multi-disc hierarchies, and broadcast newly indexed titles to the community shoutbox.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <span className="text-[11px] text-zinc-500">
              Performs rapid non-blocking filesystem walk across all 15 retro platforms.
            </span>
            <button
              type="button"
              disabled={taskStatus === "running"}
              onClick={() =>
                startTask({
                  type: "library_scan",
                })
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white shadow-xl shadow-emerald-600/30 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Trigger Full Library Rescan</span>
            </button>
          </div>
        </div>
      )}

      {/* Live Terminal & Execution Console */}
      <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col gap-4">
        {/* Terminal Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-zinc-200">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                {activeTaskTitle || "Interactive Automation Console"}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {activeTaskId ? `ID: ${activeTaskId}` : "Awaiting task execution..."}
              </span>
            </div>
          </div>

          {/* Status Badge & Controls */}
          <div className="flex items-center gap-3">
            {taskStatus === "running" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>RUNNING</span>
              </span>
            )}
            {taskStatus === "completed" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" />
                <span>COMPLETED</span>
              </span>
            )}
            {taskStatus === "failed" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                <XCircle className="w-3 h-3" />
                <span>FAILED</span>
              </span>
            )}
            {taskStatus === "cancelled" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-500/20 text-zinc-300 border border-zinc-500/30">
                <span>CANCELLED</span>
              </span>
            )}

            {taskStatus === "running" && (
              <button
                type="button"
                onClick={cancelActiveTask}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-red-600/80 hover:bg-red-600 text-white transition cursor-pointer"
              >
                Cancel Task
              </button>
            )}

            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                autoScroll
                  ? "bg-white/15 border-white/25 text-white"
                  : "bg-white/5 border-white/10 text-zinc-400"
              }`}
            >
              Auto-Scroll: {autoScroll ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={() => {
                setLogs([]);
                logOffsetRef.current = 0;
              }}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Terminal Body */}
        <div className="bg-black rounded-2xl border border-white/10 p-4 font-mono text-xs text-zinc-300 h-96 overflow-y-auto flex flex-col gap-1 select-text">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 select-none">
              <Terminal className="w-8 h-8 mb-2 opacity-40" />
              <span>Console output is empty. Select an automation task above to begin.</span>
            </div>
          ) : (
            logs.map((line, idx) => {
              const isError = line.includes("[ERROR]") || line.includes("failed") || line.includes("Error:");
              const isSuccess = line.includes("[✓]") || line.includes("[SUCCESS]") || line.includes("successfully");
              const isWarning = line.includes("[!]") || line.includes("Warning:") || line.includes("warn");
              const isHeader = line.startsWith("===") || line.startsWith("[START]");

              return (
                <div
                  key={idx}
                  className={`leading-relaxed break-all ${
                    isError
                      ? "text-red-400 font-semibold"
                      : isSuccess
                      ? "text-emerald-400 font-semibold"
                      : isWarning
                      ? "text-amber-300"
                      : isHeader
                      ? "text-zinc-500 font-bold"
                      : "text-zinc-300"
                  }`}
                >
                  {line}
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
