"use client";

import React, { useState, useTransition } from "react";
import {
  Users,
  Search,
  Key,
  Shield,
  ShieldAlert,
  Ban,
  CheckCircle,
  Trash2,
  Sliders,
  Check,
  Copy,
  AlertTriangle,
  HardDrive,
  Download,
  RefreshCw,
  Zap,
} from "lucide-react";
import {
  updateUserRoleAction,
  updateUserQuotaAction,
  updateUserStatusAction,
  resetUserPasswordAction,
  purgeUserAction,
  provisionSeedboxAction,
  deprovisionSeedboxAction,
  restartSeedboxAction,
} from "@/app/actions/admin";
import { getSafeAvatarUrl } from "@/lib/security";
import type { AdminUserListItem } from "@/types/community";

interface AdminUsersTableProps {
  initialUsers: AdminUserListItem[];
}

export function AdminUsersTable({ initialUsers }: AdminUsersTableProps) {
  const [users, setUsers] = useState<AdminUserListItem[]>(initialUsers);
  const [searchTerm, setSearchTerm] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password reset dialog state
  const [resetModalUser, setResetModalUser] = useState<AdminUserListItem | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [customPasswordInput, setCustomPasswordInput] = useState("");
  const [copied, setCopied] = useState(false);

  // Quota edit dialog state
  const [quotaModalUser, setQuotaModalUser] = useState<AdminUserListItem | null>(null);
  const [quotaInput, setQuotaInput] = useState<number>(50);

  // Purge confirmation dialog state
  const [purgeModalUser, setPurgeModalUser] = useState<AdminUserListItem | null>(null);

  // Seedbox provisioning modal state
  const [provisionModalUser, setProvisionModalUser] = useState<AdminUserListItem | null>(null);
  const [provisionQuota, setProvisionQuota] = useState<number>(100);

  // Seedbox deprovision modal state
  const [deprovisionModalUser, setDeprovisionModalUser] = useState<AdminUserListItem | null>(null);
  const [wipeDataOnDeprovision, setWipeDataOnDeprovision] = useState<boolean>(false);

  const [isPending, startTransition] = useTransition();

  const filteredUsers = users.filter((u) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      u.username.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.displayName && u.displayName.toLowerCase().includes(term))
    );
  });

  // Role toggle
  const handleToggleRole = (user: AdminUserListItem) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    startTransition(async () => {
      const res = await updateUserRoleAction(user.id, newRole);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
        );
        setFeedbackMessage({ type: "success", text: res.message || "Role updated." });
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to update role." });
      }
    });
  };

  // Status toggle
  const handleToggleStatus = (user: AdminUserListItem) => {
    const newStatus = user.accountStatus === "active" ? "suspended" : "active";
    startTransition(async () => {
      const res = await updateUserStatusAction(user.id, newStatus);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, accountStatus: newStatus } : u))
        );
        setFeedbackMessage({ type: "success", text: res.message || "Status updated." });
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to update status." });
      }
    });
  };

  // Password reset execute
  const handleResetPassword = () => {
    if (!resetModalUser) return;
    startTransition(async () => {
      const res = await resetUserPasswordAction(resetModalUser.id, customPasswordInput.trim() || undefined);
      if (res.ok && res.temporaryPassword) {
        setTempPassword(res.temporaryPassword);
        setFeedbackMessage({ type: "success", text: "Password reset complete." });
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to reset password." });
      }
    });
  };

  // Quota update execute
  const handleSaveQuota = () => {
    if (!quotaModalUser) return;
    startTransition(async () => {
      const res = await updateUserQuotaAction(quotaModalUser.id, quotaInput);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === quotaModalUser.id ? { ...u, downloadQuotaDaily: quotaInput } : u))
        );
        setQuotaModalUser(null);
        setFeedbackMessage({ type: "success", text: res.message || "Quota updated." });
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to update quota." });
      }
    });
  };

  // Purge user execute
  const handlePurgeUser = () => {
    if (!purgeModalUser) return;
    startTransition(async () => {
      const res = await purgeUserAction(purgeModalUser.id);
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== purgeModalUser.id));
        setPurgeModalUser(null);
        setFeedbackMessage({ type: "success", text: "User account wiped." });
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to purge user." });
      }
    });
  };

  // Seedbox provision execute
  const handleProvisionSeedbox = () => {
    if (!provisionModalUser) return;
    startTransition(async () => {
      const res = await provisionSeedboxAction(provisionModalUser.id, provisionQuota);
      if (res.ok && res.port) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === provisionModalUser.id
              ? {
                  ...u,
                  seedbox: {
                    id: `seedbox-${u.username}`,
                    port: res.port!,
                    status: "active",
                    quotaGb: provisionQuota,
                    createdAt: new Date().toISOString(),
                  },
                }
              : u
          )
        );
        setProvisionModalUser(null);
        setFeedbackMessage({ type: "success", text: res.message || "Seedbox provisioned!" });
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to provision seedbox." });
      }
    });
  };

  // Seedbox deprovision execute
  const handleDeprovisionSeedbox = () => {
    if (!deprovisionModalUser) return;
    startTransition(async () => {
      const res = await deprovisionSeedboxAction(deprovisionModalUser.id, wipeDataOnDeprovision);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === deprovisionModalUser.id ? { ...u, seedbox: null } : u))
        );
        setDeprovisionModalUser(null);
        setFeedbackMessage({ type: "success", text: res.message || "Seedbox removed." });
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to deprovision seedbox." });
      }
    });
  };

  // Seedbox restart execute
  const handleRestartSeedbox = (user: AdminUserListItem) => {
    startTransition(async () => {
      const res = await restartSeedboxAction(user.id);
      if (res.ok) {
        setFeedbackMessage({ type: "success", text: `Seedbox for ${user.username} restarted.` });
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to restart seedbox." });
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by username, email, or display name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>

        <span className="text-xs text-zinc-400 font-mono">
          Showing {filteredUsers.length} of {users.length} accounts
        </span>
      </div>

      {feedbackMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            feedbackMessage.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
              : "bg-red-950/80 border-red-500/40 text-red-200"
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900/60 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Daily Quota</th>
                <th className="py-3 px-4">Seedbox (/tor)</th>
                <th className="py-3 px-4">Registered</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500 italic">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isAdmin = user.role === "admin";
                  const isActive = user.accountStatus === "active";

                  return (
                    <tr key={user.id} className="hover:bg-white/[0.02] transition">
                      {/* User Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/15 flex items-center justify-center font-bold text-xs text-white uppercase overflow-hidden shrink-0">
                            {getSafeAvatarUrl(user.avatarUrl, null) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={getSafeAvatarUrl(user.avatarUrl)!}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (user.displayName || user.username).charAt(0)
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-white truncate">
                              {user.displayName || user.username}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono truncate">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role Elevation */}
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleRole(user)}
                          disabled={isPending}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                            isAdmin
                              ? "bg-red-600/30 text-red-300 border border-red-500/40 hover:bg-red-600/50"
                              : "bg-zinc-800 text-zinc-300 border border-white/10 hover:bg-zinc-700"
                          }`}
                          title="Click to toggle User / Admin"
                        >
                          {isAdmin ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                          <span>{user.role}</span>
                        </button>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          disabled={isPending}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                            isActive
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-900"
                              : "bg-red-950 text-red-400 border border-red-500/30 hover:bg-red-900"
                          }`}
                          title="Click to toggle Active / Suspended"
                        >
                          {isActive ? <CheckCircle className="w-2.5 h-2.5" /> : <Ban className="w-2.5 h-2.5" />}
                          <span>{user.accountStatus}</span>
                        </button>
                      </td>

                      {/* Daily Quota */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-zinc-300">
                            {user.downloadCountToday} / {isAdmin ? "∞" : user.downloadQuotaDaily}
                          </span>
                          {!isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setQuotaModalUser(user);
                                setQuotaInput(user.downloadQuotaDaily);
                              }}
                              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition"
                              title="Edit download quota"
                            >
                              <Sliders className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Seedbox (/tor) */}
                      <td className="py-3 px-4">
                        {user.seedbox ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>{user.seedbox.quotaGb > 0 ? `${user.seedbox.quotaGb}GB` : "Host"}</span>
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              :{user.seedbox.port}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRestartSeedbox(user)}
                              disabled={isPending}
                              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                              title="Restart Seedbox Containers"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                            {user.username !== "cfw34683" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeprovisionModalUser(user);
                                  setWipeDataOnDeprovision(false);
                                }}
                                disabled={isPending}
                                className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition cursor-pointer"
                                title="Deprovision Seedbox"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : isAdmin ? (
                          <button
                            type="button"
                            onClick={() => {
                              setProvisionModalUser(user);
                              setProvisionQuota(100);
                            }}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/40 transition cursor-pointer shadow-sm"
                            title="Provision dedicated 100GB qBittorrent + VPN instance"
                          >
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span>Provision /tor</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-zinc-600 italic">None</span>
                        )}
                      </td>

                      {/* Registered Date */}
                      <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                        {new Date(user.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setResetModalUser(user);
                              setTempPassword(null);
                              setCustomPasswordInput("");
                            }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition cursor-pointer"
                            title="Reset User Password"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setPurgeModalUser(user)}
                            className="p-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 transition cursor-pointer"
                            title="Purge User Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setResetModalUser(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-zinc-950 border border-white/20 p-5 shadow-2xl flex flex-col gap-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Key className="w-4 h-4 text-amber-400" />
                <span>Reset Password: {resetModalUser.username}</span>
              </div>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {tempPassword ? (
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200">
                <span className="font-bold text-sm">Temporary Password Generated:</span>
                <div className="flex items-center justify-between bg-black/60 p-2.5 rounded-lg font-mono text-sm border border-emerald-500/30">
                  <span className="text-white select-all">{tempPassword}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(tempPassword);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-1.5 rounded hover:bg-white/10 text-emerald-300"
                    title="Copy Password"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Provide this password to the user. All active login sessions for this account have been invalidated.
                </p>
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="mt-2 w-full py-2 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-zinc-400">
                  You can generate a secure temporary password automatically, or specify a custom password below:
                </p>

                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">
                    Custom Password (Optional, min 8 chars)
                  </label>
                  <input
                    type="text"
                    placeholder="Leave blank to auto-generate"
                    value={customPasswordInput}
                    onChange={(e) => setCustomPasswordInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="px-4 py-2 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={isPending}
                    className="px-4 py-2 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30"
                  >
                    {isPending ? "Resetting..." : "Reset Password"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quota Modal */}
      {quotaModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setQuotaModalUser(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-white/20 p-5 shadow-2xl flex flex-col gap-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="font-bold text-sm text-white">
                Adjust Quota: {quotaModalUser.username}
              </span>
              <button
                type="button"
                onClick={() => setQuotaModalUser(null)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block font-semibold text-zinc-300 mb-1">
                Daily Download Quota (ROMs / Day)
              </label>
              <input
                type="number"
                min={0}
                max={10000}
                value={quotaInput}
                onChange={(e) => setQuotaInput(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white font-mono text-base focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setQuotaModalUser(null)}
                className="px-4 py-2 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuota}
                disabled={isPending}
                className="px-4 py-2 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white"
              >
                Save Quota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge User Modal */}
      {purgeModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setPurgeModalUser(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-zinc-950 border border-red-500/40 p-5 shadow-2xl flex flex-col gap-4 text-xs"
          >
            <div className="flex items-center gap-2.5 text-red-400 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Confirm Permanent Account Purge</span>
            </div>

            <p className="text-zinc-300 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <strong className="text-white">{purgeModalUser.username}</strong> ({purgeModalUser.email})?
              This will irreversibly wipe all associated virtual cloud memory cards, high scores, ratings, and comments.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setPurgeModalUser(null)}
                className="px-4 py-2 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeUser}
                disabled={isPending}
                className="px-4 py-2 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30"
              >
                {isPending ? "Purging..." : "Permanently Purge User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision Seedbox Modal */}
      {provisionModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setProvisionModalUser(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-zinc-950 border border-blue-500/40 p-5 shadow-2xl flex flex-col gap-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Deploy Torrent Seedbox: {provisionModalUser.username}</span>
              </div>
              <button
                type="button"
                onClick={() => setProvisionModalUser(null)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-2 text-zinc-300 leading-relaxed">
              <p>
                This will automatically spin up a dedicated, isolated stack for{" "}
                <strong className="text-white">{provisionModalUser.username}</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                <li>
                  <strong className="text-white">qBittorrent</strong> container with SSO authentication bypass.
                </li>
                <li>
                  <strong className="text-white">Gluetun VPN</strong> tunnel using PIA (Florida) encryption &amp; kill-switch.
                </li>
                <li>
                  <strong className="text-white">ZFS Dataset</strong> at{" "}
                  <code className="text-blue-300">/mnt/storage/oldsmarchaos.com/seedboxes/{provisionModalUser.username}/downloads</code>.
                </li>
                <li>
                  Integrated into <code className="text-emerald-300">oldsmarchaos.com/tor/</code> so they see only their torrents.
                </li>
              </ul>
            </div>

            <div>
              <label className="block font-semibold text-zinc-300 mb-1">
                Hard ZFS Storage Quota (GB)
              </label>
              <input
                type="number"
                min={10}
                max={5000}
                value={provisionQuota}
                onChange={(e) => setProvisionQuota(parseInt(e.target.value, 10) || 100)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white font-mono text-base focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                ZFS enforces this quota at the file system level.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setProvisionModalUser(null)}
                className="px-4 py-2 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProvisionSeedbox}
                disabled={isPending}
                className="px-4 py-2 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30"
              >
                {isPending ? "Deploying Stack..." : "Deploy 100GB Seedbox"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deprovision Seedbox Modal */}
      {deprovisionModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setDeprovisionModalUser(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-zinc-950 border border-red-500/40 p-5 shadow-2xl flex flex-col gap-4 text-xs"
          >
            <div className="flex items-center gap-2.5 text-red-400 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Deprovision Seedbox: {deprovisionModalUser.username}</span>
            </div>

            <p className="text-zinc-300 leading-relaxed">
              This will stop and remove the qBittorrent and Gluetun containers for{" "}
              <strong className="text-white">{deprovisionModalUser.username}</strong> and revoke their access to /tor.
            </p>

            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-red-950/40 border border-red-500/20 text-red-200 cursor-pointer">
              <input
                type="checkbox"
                checked={wipeDataOnDeprovision}
                onChange={(e) => setWipeDataOnDeprovision(e.target.checked)}
                className="rounded border-red-500/50 bg-zinc-900 text-red-600 focus:ring-0"
              />
              <span className="text-[11px]">
                Permanently destroy ZFS dataset and wipe all downloaded files
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDeprovisionModalUser(null)}
                className="px-4 py-2 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeprovisionSeedbox}
                disabled={isPending}
                className="px-4 py-2 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30"
              >
                {isPending ? "Deprovisioning..." : "Deprovision Seedbox"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
