# ROM Vault — Virtual Memory Cards & Cloud Saves Guide

> [!IMPORTANT]
> **Notice on Generalized Placeholders**:
> All endpoint URLs and example payload paths in this guide are generalized placeholders.

---

## 1. Overview

ROM Vault features an in-browser cloud save synchronization system designed to preserve game progression across browser sessions, mobile devices, and desktop clients without causing frame drops during emulation.

---

## 2. Platform Formats & Binary Specifications

### A. PlayStation 1 (`psx` / `ps1`)
- **Core**: PCSX ReARMed (via EmulatorJS)
- **Format**: `.mcr` (Raw 128 KB memory card image)
- **Size**: Exactly `131,072` bytes (16 blocks of 8,192 bytes each)
- **Initialization**: Initialized with `0x00` bytes

### B. PlayStation 2 (`ps2`)
- **Core**: PCSX2 WebAssembly (via TabStationToo)
- **Format**: `.ps2` (Sony PlayStation 2 8 MB memory card image with ECC)
- **Size**: Exactly `8,650,752` bytes (8,388,608 bytes user data + 262,144 bytes ECC spare area)
- **Initialization**: Initialized with `0xff` bytes

### C. Cartridge Systems (`nes`, `snes`, `gba`, `genesis`, etc.)
- **Core**: EmulatorJS cores
- **Format**: `.srm` (Battery-backed SRAM)
- **Size**: Dynamic capacity (typically 8 KB, 32 KB, 64 KB, 128 KB, or 512 KB)
- **Storage Location**: Scoped to user ID or fallback storage under `/mnt/storage/roms/saves/{system}/{cleanName}.srm`

---

## 3. Multi-Slot Management & Cloud Sync APIs

Authenticated users can assign up to 5 virtual memory cards per platform:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/users/me/cards` | `GET` | List active virtual memory card slots for current user |
| `/api/users/me/cards` | `POST` | Create a new virtual memory card slot |
| `/api/users/me/cards/[id]` | `PATCH` | Update card name or set as primary card |
| `/api/users/me/cards/[id]` | `DELETE` | Delete virtual card and associated save file |
| `/api/users/me/cards/[id]/download` | `GET` | Export raw binary card (`.mcr` / `.ps2` / `.srm`) |
| `/api/users/me/cards/[id]/sync` | `POST` | Synchronize binary card data from emulator iframe |

---

## 4. Guest Mode & Fallback Isolation

When an unauthenticated visitor launches an emulation session:
- The system automatically mounts a guest memory card binary rather than raising a `401 Unauthorized` modal error.
- Guest card changes are persisted in client-side IndexedDB / Web Storage, preventing guest saves from overwriting canonical server-side progression.
