import fs from "fs";
import path from "path";
import crypto from "crypto";
import { query, execute } from "@/lib/db";
import { generateUUID } from "@/lib/auth/crypto";
import { getStorageRoot } from "@/lib/paths";
import type { UserMemoryCard } from "@/types/auth";

export const PS1_CARD_SIZE = 131072; // 128 KB (15 save blocks of 8 KB + 1 directory frame)
export const PS2_CARD_SIZE = 8650752; // 8 MB (8,650,752 bytes: 512-byte pages + 16 bytes ECC)
export const MAX_CARDS_PER_USER = 5;

function getStorageRootPrimary(): string {
  return path.join(getStorageRoot(), "saves/users");
}
const STORAGE_ROOT_FALLBACK = "/storage/saves/users";

export function normalizeCardSystem(sys?: string | null): "psx" | "ps2" {
  if (!sys) return "psx";
  const s = sys.toLowerCase().trim();
  if (s === "ps2" || s === "playstation2") return "ps2";
  return "psx";
}

/**
 * Returns the storage directory for a specific user's virtual memory cards.
 */
export function getUserMemoryCardDir(userId: string): string {
  const cleanUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  const primary = getStorageRootPrimary();
  let baseDir = primary;
  try {
    fs.mkdirSync(primary, { recursive: true });
  } catch {
    baseDir = STORAGE_ROOT_FALLBACK;
  }

  const userDir = path.resolve(baseDir, cleanUserId);
  try {
    fs.mkdirSync(userDir, { recursive: true });
  } catch {}
  return userDir;
}

/**
 * Generates an authentic formatted 128 KB Sony PlayStation 1 Memory Card image.
 */
export function createFormattedPs1MemoryCard(): Buffer {
  const buf = Buffer.alloc(PS1_CARD_SIZE, 0);

  // Frame 0: Magic Header ("MC") + Checksum 0x0E
  buf[0] = 0x4d; // 'M'
  buf[1] = 0x43; // 'C'
  let xor0 = 0;
  for (let i = 0; i < 127; i++) xor0 ^= buf[i];
  buf[127] = xor0; // 0x0E

  // Frames 1..15: 15 Unallocated Directory Entries
  for (let f = 1; f <= 15; f++) {
    const offset = f * 128;
    buf[offset] = 0xa0;     // Block state: Unallocated
    buf[offset + 8] = 0xff; // Next block pointer: 0xFFFF (end of chain)
    buf[offset + 9] = 0xff;
    let xor = 0;
    for (let i = 0; i < 127; i++) xor ^= buf[offset + i];
    buf[offset + 127] = xor; // 0xA0
  }

  // Frames 16..35: Broken Block List (20 frames)
  for (let f = 16; f <= 35; f++) {
    const offset = f * 128;
    buf[offset] = 0xff;
    buf[offset + 1] = 0xff;
    buf[offset + 2] = 0xff;
    buf[offset + 3] = 0xff;
    let xor = 0;
    for (let i = 0; i < 127; i++) xor ^= buf[offset + i];
    buf[offset + 127] = xor; // 0x00
  }

  return buf;
}

/**
 * Generates a clean authentic 8 MB Sony PlayStation 2 Memory Card image (.ps2).
 * Formatted with 0xFF bytes per PCSX2 raw card specification.
 */
export function createFormattedPs2MemoryCard(): Buffer {
  return Buffer.alloc(PS2_CARD_SIZE, 0xff);
}

/**
 * Computes SHA-256 hash string for checksum verification.
 */
export function computeCardChecksum(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Lists all memory cards for a user and system, ordered by slot_index (Slot 1 is top/active).
 */
export async function listUserMemoryCards(
  userId: string,
  systemInput: string = "psx"
): Promise<UserMemoryCard[]> {
  const system = normalizeCardSystem(systemInput);
  const cards = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE user_id = ? AND system = ? ORDER BY slot_index ASC",
    [userId, system]
  );

  // If user has zero cards for this system, automatically provision their default Slot 1 card
  if (cards.length === 0) {
    const defaultCard = await ensureDefaultCard(userId, system);
    return [defaultCard];
  }

  return cards;
}

/**
 * Ensures user has at least Slot 1 default virtual memory card for the requested system.
 */
export async function ensureDefaultCard(
  userId: string,
  systemInput: string = "psx"
): Promise<UserMemoryCard> {
  const system = normalizeCardSystem(systemInput);
  const existing = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE user_id = ? AND system = ? AND slot_index = 1 LIMIT 1",
    [userId, system]
  );

  if (existing.length > 0) {
    return existing[0];
  }

  const cardId = generateUUID();
  const userDir = getUserMemoryCardDir(userId);
  const isPs2 = system === "ps2";
  const ext = isPs2 ? "ps2" : "mcr";
  const filePath = path.join(userDir, `${system}_card_slot1_${cardId}.${ext}`);

  let initialBuffer: Buffer | null = null;

  if (isPs2) {
    initialBuffer = createFormattedPs2MemoryCard();
  } else {
    // Check if there is an existing FF7 or PS1 save from prior sessions to preserve
    const legacyCandidate = path.join(getStorageRoot(), "saves/psx/Final_20Fantasy_20VII_20(USA)_20.srm");
    try {
      if (fs.existsSync(legacyCandidate)) {
        const legacyBuf = fs.readFileSync(legacyCandidate);
        if (legacyBuf.byteLength === PS1_CARD_SIZE) {
          initialBuffer = legacyBuf;
        }
      }
    } catch {}

    if (!initialBuffer) {
      initialBuffer = createFormattedPs1MemoryCard();
    }
  }

  fs.writeFileSync(filePath, initialBuffer);
  try {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  } catch {}

  const checksum = computeCardChecksum(initialBuffer);
  const defaultLabel = isPs2
    ? "Primary PS2 Memory Card (Slot 1)"
    : "Primary Memory Card (Slot 1)";

  await execute(
    `INSERT INTO user_memory_cards (id, user_id, system, slot_index, card_name, file_path, size_bytes, checksum, version)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, 1)`,
    [cardId, userId, system, defaultLabel, filePath, initialBuffer.byteLength, checksum]
  );

  const [created] = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE id = ? LIMIT 1",
    [cardId]
  );

  return created;
}

/**
 * Creates an additional memory card for the user (up to 5 cards max per system).
 */
export async function createUserMemoryCard(
  userId: string,
  systemInput: string = "psx",
  cardName?: string
): Promise<UserMemoryCard> {
  const system = normalizeCardSystem(systemInput);
  const existing = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE user_id = ? AND system = ? ORDER BY slot_index ASC",
    [userId, system]
  );

  if (existing.length >= MAX_CARDS_PER_USER) {
    throw new Error(`Maximum limit of ${MAX_CARDS_PER_USER} virtual memory cards reached for ${system.toUpperCase()}.`);
  }

  const nextSlot = existing.length + 1;
  const cardId = generateUUID();
  const isPs2 = system === "ps2";
  const defaultBaseName = isPs2 ? `PS2 Memory Card ${nextSlot}` : `Memory Card ${nextSlot}`;
  const label = cardName?.trim() || defaultBaseName;

  const userDir = getUserMemoryCardDir(userId);
  const ext = isPs2 ? "ps2" : "mcr";
  const filePath = path.join(userDir, `${system}_card_slot${nextSlot}_${cardId}.${ext}`);

  const initialBuffer = isPs2
    ? createFormattedPs2MemoryCard()
    : createFormattedPs1MemoryCard();

  fs.writeFileSync(filePath, initialBuffer);
  try {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  } catch {}

  const checksum = computeCardChecksum(initialBuffer);

  await execute(
    `INSERT INTO user_memory_cards (id, user_id, system, slot_index, card_name, file_path, size_bytes, checksum, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [cardId, userId, system, nextSlot, label, filePath, initialBuffer.byteLength, checksum]
  );

  const [created] = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE id = ? LIMIT 1",
    [cardId]
  );

  return created;
}

/**
 * Updates card details (rename or reorder slot).
 */
export async function updateUserMemoryCard(
  userId: string,
  cardId: string,
  updates: { cardName?: string; targetSlot?: number }
): Promise<UserMemoryCard> {
  const [card] = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE id = ? AND user_id = ? LIMIT 1",
    [cardId, userId]
  );

  if (!card) {
    throw new Error("Memory card not found.");
  }

  const system = normalizeCardSystem(card.system);

  // Handle renaming
  if (updates.cardName && updates.cardName.trim()) {
    const cleanName = updates.cardName.trim().slice(0, 100);
    await execute(
      "UPDATE user_memory_cards SET card_name = ? WHERE id = ?",
      [cleanName, cardId]
    );
  }

  // Handle slot reordering (e.g. promoting card to Slot 1 / top)
  if (typeof updates.targetSlot === "number" && updates.targetSlot >= 1 && updates.targetSlot <= MAX_CARDS_PER_USER) {
    const allCards = await query<UserMemoryCard>(
      "SELECT * FROM user_memory_cards WHERE user_id = ? AND system = ? ORDER BY slot_index ASC",
      [userId, system]
    );

    const oldSlot = card.slot_index;
    const newSlot = Math.min(updates.targetSlot, allCards.length);

    if (oldSlot !== newSlot) {
      const reordered = allCards.filter((c) => c.id !== cardId);
      reordered.splice(newSlot - 1, 0, card);

      // Temporarily offset slots to avoid unique constraint collision
      for (let i = 0; i < reordered.length; i++) {
        await execute(
          "UPDATE user_memory_cards SET slot_index = ? WHERE id = ?",
          [100 + i, reordered[i].id]
        );
      }

      // Assign final contiguous 1..N slot indices
      for (let i = 0; i < reordered.length; i++) {
        await execute(
          "UPDATE user_memory_cards SET slot_index = ? WHERE id = ?",
          [i + 1, reordered[i].id]
        );
      }
    }
  }

  const [updated] = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE id = ? LIMIT 1",
    [cardId]
  );

  return updated;
}

/**
 * Deletes a memory card (enforcing at least 1 remaining card for that system).
 */
export async function deleteUserMemoryCard(userId: string, cardId: string): Promise<void> {
  const [target] = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE id = ? AND user_id = ? LIMIT 1",
    [cardId, userId]
  );

  if (!target) {
    throw new Error("Memory card not found.");
  }

  const system = normalizeCardSystem(target.system);
  const allCards = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE user_id = ? AND system = ? ORDER BY slot_index ASC",
    [userId, system]
  );

  if (allCards.length <= 1) {
    throw new Error(`Cannot delete your only ${system.toUpperCase()} memory card. At least one virtual card is required.`);
  }

  // Remove file from disk
  try {
    if (fs.existsSync(target.file_path)) {
      fs.unlinkSync(target.file_path);
    }
    const bak = `${target.file_path}.bak`;
    if (fs.existsSync(bak)) {
      fs.unlinkSync(bak);
    }
  } catch (err) {
    console.error("[deleteUserMemoryCard] Failed removing file from disk:", err);
  }

  // Remove DB record
  await execute("DELETE FROM user_memory_cards WHERE id = ?", [cardId]);

  // Re-compact remaining slots
  const remaining = allCards.filter((c) => c.id !== cardId);
  for (let i = 0; i < remaining.length; i++) {
    await execute(
      "UPDATE user_memory_cards SET slot_index = ? WHERE id = ?",
      [i + 1, remaining[i].id]
    );
  }
}

/**
 * Resolves the card's file path on disk, migrating legacy storage paths automatically.
 */
export function resolveActualCardPath(card: UserMemoryCard): string {
  if (
    card.file_path &&
    card.file_path.startsWith(getStorageRoot()) &&
    fs.existsSync(card.file_path)
  ) {
    return card.file_path;
  }

  // Check under current active storage root for this user
  const fileName = path.basename(card.file_path || "");
  const defaultFileName = fileName || `${card.system}_card_slot${card.slot_index}_${card.id}.${normalizeCardSystem(card.system) === "ps2" ? "ps2" : "mcr"}`;
  const userDir = getUserMemoryCardDir(card.user_id);
  return path.resolve(userDir, defaultFileName);
}

/**
 * Retrieves a card and its binary data (supports 'active' or 'top' alias for slot 1).
 */
export async function getUserMemoryCardBinary(
  userId: string,
  cardIdOrSlot: string,
  systemInput: string = "psx"
): Promise<{ card: UserMemoryCard; buffer: Buffer }> {
  const system = normalizeCardSystem(systemInput);
  let card: UserMemoryCard | undefined;

  if (cardIdOrSlot === "active" || cardIdOrSlot === "top" || cardIdOrSlot === "1") {
    const rows = await query<UserMemoryCard>(
      "SELECT * FROM user_memory_cards WHERE user_id = ? AND system = ? AND slot_index = 1 LIMIT 1",
      [userId, system]
    );
    card = rows[0];
    if (!card) {
      card = await ensureDefaultCard(userId, system);
    }
  } else {
    const rows = await query<UserMemoryCard>(
      "SELECT * FROM user_memory_cards WHERE id = ? AND user_id = ? LIMIT 1",
      [cardIdOrSlot, userId]
    );
    card = rows[0];
  }

  if (!card) {
    throw new Error("Memory card not found.");
  }

  const resolvedPath = resolveActualCardPath(card);
  if (resolvedPath !== card.file_path) {
    card.file_path = resolvedPath;
    execute("UPDATE user_memory_cards SET file_path = ? WHERE id = ?", [resolvedPath, card.id]).catch(() => {});
  }

  const expectedSize = normalizeCardSystem(card.system) === "ps2" ? PS2_CARD_SIZE : PS1_CARD_SIZE;
  let buffer: Buffer;

  if (fs.existsSync(card.file_path)) {
    buffer = fs.readFileSync(card.file_path);
  } else {
    // Reconstruct missing file from template
    buffer = normalizeCardSystem(card.system) === "ps2"
      ? createFormattedPs2MemoryCard()
      : createFormattedPs1MemoryCard();
    const dir = path.dirname(card.file_path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(card.file_path, buffer);
  }

  return { card, buffer };
}

/**
 * Synchronizes updated memory card binary from the emulator back to storage.
 */
export async function syncUserMemoryCard(
  userId: string,
  cardIdOrSlot: string,
  newBuffer: Buffer,
  systemInput: string = "psx",
  expectedChecksum?: string
): Promise<UserMemoryCard> {
  const system = normalizeCardSystem(systemInput);
  const { card } = await getUserMemoryCardBinary(userId, cardIdOrSlot, system);

  const resolvedPath = resolveActualCardPath(card);
  if (resolvedPath !== card.file_path) {
    card.file_path = resolvedPath;
    execute("UPDATE user_memory_cards SET file_path = ? WHERE id = ?", [resolvedPath, card.id]).catch(() => {});
  }

  // Validate payload size
  if (!newBuffer || newBuffer.byteLength === 0) {
    throw new Error("Empty memory card payload.");
  }

  const isPs2 = normalizeCardSystem(card.system) === "ps2";
  const requiredSize = isPs2 ? PS2_CARD_SIZE : PS1_CARD_SIZE;

  // Format check: Pad or trim to standard size if necessary
  let finalBuffer = newBuffer;
  if (newBuffer.byteLength !== requiredSize) {
    if (newBuffer.byteLength < requiredSize) {
      finalBuffer = Buffer.alloc(requiredSize, isPs2 ? 0xff : 0x00);
      newBuffer.copy(finalBuffer);
    } else {
      finalBuffer = newBuffer.subarray(0, requiredSize);
    }
  }

  const newChecksum = computeCardChecksum(finalBuffer);

  // If checksum hasn't changed, return without touching disk
  if (newChecksum === card.checksum) {
    return card;
  }

  // Check collision if expectedChecksum was sent by client
  if (expectedChecksum && expectedChecksum !== card.checksum) {
    console.warn(`[SaveSync Conflict] Client expected ${expectedChecksum}, server had ${card.checksum}`);
  }

  // Atomic file write: write to .tmp, rename, and keep .bak
  const dir = path.dirname(card.file_path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${card.file_path}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, finalBuffer);
  fs.renameSync(tmpPath, card.file_path);

  try {
    fs.copyFileSync(card.file_path, `${card.file_path}.bak`);
  } catch {}

  // Update DB with new checksum and increment version
  await execute(
    `UPDATE user_memory_cards
     SET checksum = ?, version = version + 1, size_bytes = ?
     WHERE id = ?`,
    [newChecksum, finalBuffer.byteLength, card.id]
  );

  const [updated] = await query<UserMemoryCard>(
    "SELECT * FROM user_memory_cards WHERE id = ? LIMIT 1",
    [card.id]
  );

  return updated;
}
