"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  User,
  Shield,
  Key,
  HardDrive,
  LogOut,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Trash2,
  ArrowUp,
  Plus,
  Edit2,
  Gamepad2,
} from "lucide-react";
import type { UserMemoryCard } from "@/types/auth";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id: string;
    username: string;
    email: string;
    role: "user" | "admin";
    displayName: string | null;
    avatarUrl: string | null;
    quotaDaily: number | null;
    quotaUsedToday: number;
  };
  onProfileUpdated?: (updated: { displayName: string | null }) => void;
}

export function UserProfileModal({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
}: UserProfileModalProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<"profile" | "cards" | "password">("profile");

  // Profile form state
  const [displayName, setDisplayName] = useState<string>(currentUser.displayName || currentUser.username);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [isSavingPassword, setIsSavingPassword] = useState<boolean>(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Memory cards state
  const [cards, setCards] = useState<UserMemoryCard[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState<boolean>(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [cardsSuccess, setCardsSuccess] = useState<string | null>(null);
  const [isCreatingCard, setIsCreatingCard] = useState<boolean>(false);
  const [newCardName, setNewCardName] = useState<string>("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardName, setEditingCardName] = useState<string>("");

  // Logout state
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const fetchCards = useCallback(async () => {
    setIsLoadingCards(true);
    setCardsError(null);
    try {
      const res = await fetch("/roms/api/users/me/cards");
      const data = await res.json();
      if (res.ok && data.cards) {
        setCards(data.cards);
      } else {
        setCardsError(data.error || "Failed to load memory cards.");
      }
    } catch {
      setCardsError("Network error loading memory cards.");
    } finally {
      setIsLoadingCards(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === "cards") {
      fetchCards();
    }
  }, [isOpen, activeTab, fetchCards]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setIsSavingProfile(true);

    try {
      const res = await fetch("/roms/api/users/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });

      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error || "Failed to update profile.");
        setIsSavingProfile(false);
        return;
      }

      setProfileSuccess("Profile updated successfully!");
      if (onProfileUpdated) {
        onProfileUpdated({ displayName });
      }
      setIsSavingProfile(false);
    } catch {
      setProfileError("Network error occurred.");
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    setIsSavingPassword(true);

    try {
      const res = await fetch("/roms/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error || "Failed to update password.");
        setIsSavingPassword(false);
        return;
      }

      setPasswordSuccess("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsSavingPassword(false);
    } catch {
      setPasswordError("Network error occurred.");
      setIsSavingPassword(false);
    }
  };

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardsError(null);
    setCardsSuccess(null);
    setIsLoadingCards(true);

    try {
      const res = await fetch("/roms/api/users/me/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardName: newCardName.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCardsError(data.error || "Failed to create memory card.");
      } else {
        setCardsSuccess("New virtual memory card initialized!");
        setNewCardName("");
        setIsCreatingCard(false);
        await fetchCards();
      }
    } catch {
      setCardsError("Network error creating memory card.");
    } finally {
      setIsLoadingCards(false);
    }
  };

  const handleSetSlot1 = async (cardId: string) => {
    setCardsError(null);
    setCardsSuccess(null);
    setIsLoadingCards(true);

    try {
      const res = await fetch(`/roms/api/users/me/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moveSlot1: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCardsError(data.error || "Failed to set card as active.");
      } else {
        setCardsSuccess("Memory card set as Slot 1 (Active Boot Card)!");
        await fetchCards();
      }
    } catch {
      setCardsError("Network error setting active card.");
    } finally {
      setIsLoadingCards(false);
    }
  };

  const handleSaveRename = async (cardId: string) => {
    if (!editingCardName.trim()) {
      setEditingCardId(null);
      return;
    }
    setCardsError(null);
    setCardsSuccess(null);

    try {
      const res = await fetch(`/roms/api/users/me/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardName: editingCardName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCardsError(data.error || "Failed to rename card.");
      } else {
        setCardsSuccess("Card renamed successfully.");
        setEditingCardId(null);
        await fetchCards();
      }
    } catch {
      setCardsError("Network error renaming card.");
    }
  };

  const handleDeleteCard = async (card: UserMemoryCard) => {
    if (cards.length <= 1) {
      setCardsError("Cannot delete your only memory card.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete "${card.card_name}"? All saves stored on this card will be permanently deleted.`)) {
      return;
    }

    setCardsError(null);
    setCardsSuccess(null);
    setIsLoadingCards(true);

    try {
      const res = await fetch(`/roms/api/users/me/cards/${card.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        setCardsError(data.error || "Failed to delete card.");
      } else {
        setCardsSuccess(`Memory card "${card.card_name}" deleted.`);
        await fetchCards();
      }
    } catch {
      setCardsError("Network error deleting card.");
    } finally {
      setIsLoadingCards(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/roms/api/auth/logout", { method: "POST" });
    } catch {}
    window.location.replace("/roms/auth/login");
  };

  const isAdmin = currentUser.role === "admin";
  const remainingQuota = isAdmin
    ? "Unlimited"
    : `${Math.max(0, (currentUser.quotaDaily ?? 50) - currentUser.quotaUsedToday)} of ${currentUser.quotaDaily ?? 50} remaining`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg shadow-red-600/30">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  {currentUser.displayName || currentUser.username}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    currentUser.role === "admin"
                      ? "bg-purple-950 text-purple-300 border border-purple-500/40"
                      : "bg-blue-950 text-blue-300 border border-blue-500/40"
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-zinc-400">{currentUser.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quota & Info Strip */}
        <div className="grid grid-cols-2 gap-2 px-6 py-2.5 bg-black/40 border-b border-white/10 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-zinc-400 text-[11px]">Daily Download Quota:</div>
              <div className="font-bold text-zinc-200">
                {isAdmin ? (
                  <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                    <span className="text-base leading-none">∞</span> Unlimited (Admin)
                  </span>
                ) : (
                  remainingQuota
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <div className="text-zinc-400 text-[11px]">Account Status:</div>
              <div className="font-bold text-emerald-400">Active (Verified)</div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 px-6 bg-zinc-950/40 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === "profile"
                ? "border-red-500 text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Profile Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cards")}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "cards"
                ? "border-red-500 text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5 text-red-400" />
            <span>PS1 Memory Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("password")}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === "password"
                ? "border-red-500 text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Security &amp; Password
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto">
          {activeTab === "profile" && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {profileSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{profileSuccess}</span>
                </div>
              )}
              {profileError && (
                <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span>{profileError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:outline-none focus:border-red-500/80 transition"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Visible in your header badge and save file logs.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Username (Permanent)
                </label>
                <input
                  type="text"
                  disabled
                  value={currentUser.username}
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-950/50 border border-white/5 text-sm text-zinc-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={currentUser.email}
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-950/50 border border-white/5 text-sm text-zinc-500 cursor-not-allowed"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {activeTab === "cards" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Virtual Memory Cards</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-zinc-300">
                      {cards.length} / 5 Cards
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    PS1 games automatically boot using your top card (<strong className="text-emerald-400">Slot 1</strong>).
                  </p>
                </div>

                {!isCreatingCard && cards.length < 5 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingCard(true);
                      setNewCardName(`Memory Card ${cards.length + 1}`);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Card</span>
                  </button>
                )}
              </div>

              {cardsSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{cardsSuccess}</span>
                </div>
              )}
              {cardsError && (
                <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span>{cardsError}</span>
                </div>
              )}

              {/* Create Card Form */}
              {isCreatingCard && (
                <form
                  onSubmit={handleCreateCard}
                  className="p-4 rounded-xl bg-zinc-950 border border-red-500/40 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Gamepad2 className="w-3.5 h-3.5 text-red-400" />
                      Initialize New Virtual Memory Card
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingCard(false)}
                      className="text-zinc-500 hover:text-white text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                  <div>
                    <input
                      type="text"
                      autoFocus
                      required
                      placeholder="e.g. JRPGs &amp; Final Fantasy, Racing..."
                      value={newCardName}
                      onChange={(e) => setNewCardName(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/80"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCreatingCard(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoadingCards}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition cursor-pointer"
                    >
                      {isLoadingCards ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Format &amp; Create (128 KB)</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Cards List */}
              {isLoadingCards && cards.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                  <span>Loading memory cards...</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cards.map((card) => {
                    const isSlot1 = card.slot_index === 1;
                    const isEditing = editingCardId === card.id;

                    return (
                      <div
                        key={card.id}
                        className={`p-3.5 rounded-xl border transition ${
                          isSlot1
                            ? "bg-zinc-950/80 border-emerald-500/40 shadow-lg shadow-emerald-950/20"
                            : "bg-zinc-950/40 border-white/10 hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Slot Badge */}
                            <div
                              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 font-black text-xs ${
                                isSlot1
                                  ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                                  : "bg-white/5 border border-white/10 text-zinc-400"
                              }`}
                            >
                              <span className="text-[9px] uppercase font-bold tracking-tight text-zinc-400">Slot</span>
                              <span className="text-sm font-extrabold">{card.slot_index}</span>
                            </div>

                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingCardName}
                                    onChange={(e) => setEditingCardName(e.target.value)}
                                    className="px-2.5 py-1 rounded bg-zinc-900 border border-red-500 text-xs text-white w-full"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveRename(card.id)}
                                    className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer shrink-0"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingCardId(null)}
                                    className="px-2 py-1 text-zinc-400 hover:text-white text-xs shrink-0"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-white truncate">
                                      {card.card_name}
                                    </span>
                                    {isSlot1 && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider shrink-0">
                                        Active Boot Card
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCardId(card.id);
                                        setEditingCardName(card.card_name);
                                      }}
                                      className="text-zinc-500 hover:text-zinc-300 transition"
                                      title="Rename card"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5">
                                    <span>128 KB (15 blocks)</span>
                                    <span>&bull;</span>
                                    <span>v{card.version}</span>
                                    <span>&bull;</span>
                                    <span>
                                      Synced: {new Date(card.updated_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isSlot1 && (
                              <button
                                type="button"
                                onClick={() => handleSetSlot1(card.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-emerald-600/80 hover:text-white text-zinc-300 transition cursor-pointer"
                                title="Move to Slot 1 (Default boot memory card for PS1 games)"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Set Active</span>
                              </button>
                            )}

                            <a
                              href={`/roms/api/users/me/cards/${card.id}/download?download=1`}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
                              title="Download .MCR raw card binary (DuckStation / RetroArch compatible)"
                            >
                              <Download className="w-4 h-4" />
                            </a>

                            {cards.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCard(card)}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition cursor-pointer"
                                title="Delete virtual memory card"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "password" && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{passwordSuccess}</span>
                </div>
              )}
              {passwordError && (
                <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:outline-none focus:border-red-500/80 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  New Password (min 8 chars, mixed case, numbers &amp; symbols)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:outline-none focus:border-red-500/80 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:outline-none focus:border-red-500/80 transition"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingPassword}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-md shadow-red-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  {isSavingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-zinc-950/60 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-zinc-500">
            ROM Vault &bull; User ID: {currentUser.id.slice(0, 8)}...
          </span>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-red-400 hover:bg-red-950/30 border border-white/10 hover:border-red-500/40 transition cursor-pointer disabled:opacity-50"
          >
            {isLoggingOut ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
