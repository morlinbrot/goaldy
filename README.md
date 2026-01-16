# Goaldy

A personal budgeting and savings motivation app. Phone-first, offline-first, speed-focused.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **App Framework**: Tauri v2 (iOS, Android, Desktop)
- **Local Database**: SQLite via `@tauri-apps/plugin-sql`

## Development

### Prerequisites

- Node.js 22+
- Rust toolchain
- For iOS: Xcode + iOS development setup
- For Android: Android Studio + NDK

### Setup

```bash
npm install
```

### Run Development Server

```bash
# Desktop
npm run tauri dev

# iOS
npm run tauri ios dev

# Android
npm run tauri android dev
```

### Build

```bash
# Desktop
npm run tauri build

# iOS
npm run tauri ios build

# Android
npm run tauri android build
```

## Project Structure

```
src/                  # React frontend
  components/         # UI components
  lib/               # Database, types, utilities
src-tauri/           # Tauri/Rust backend
  src/               # Rust source (SQLite migrations)
  capabilities/      # Permission configuration
```
