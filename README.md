# X & O – Base Mini App

**X & O** is a Tic-Tac-Toe–style mini game built for the **Base** ecosystem.  
Players connect a Base wallet, play locally, vs AI, or online, and have their wins and rewards tracked by **wallet address** in Firebase.

---

## Overview

- **Framework:** Next.js (App Router)
- **Chain:** Base Mainnet (8453)
- **Auth / Identity:** Wallet address (no Firebase Auth UID)
- **Backend:** Firebase Firestore
- **UX:** Mobile-first, mini-app friendly UI

The app gates the entire experience behind a Base wallet connection, then uses that wallet address as the canonical user identifier for stats, wallet balance, and matchmaking.

---

## Core Features

### 🎮 Game Modes

1. **Local 2-Player**
   - Two players share the same device.
   - X & O alternate on the same board.
   - No network sync; purely client-side.

2. **AI Mode**
   - Player is always **X**, AI is **O**.
   - Two difficulty levels:
     - **Medium:** Minimax AI with some randomness (20% random choice).
     - **Hard:** Full Minimax optimization for optimal play.
   - Game state is stored locally; results are still recorded to Firestore for the connected wallet.

3. **Online Multiplayer**
   - Wallet-based matchmaking.
   - Player X creates a game and gets a **short game ID** (8 characters).
   - Player O joins by entering that ID.
   - Live sync via Firestore `onSnapshot` on the `games/{gameId}` document.
   - Online wins reward more than local/AI wins, and losses can reduce wallet balance.

---

## 🧠 AI Logic

The AI is implemented with a classic **Minimax** algorithm:

- `checkWinner(board)` checks all winning lines using `WINNING_COMBINATIONS`.
- `minimax(board, depth, isMax, player, opponent)` recursively explores:
  - Maximizing player’s best moves.
  - Minimizing opponent’s best responses.
- `findBestMove(board, player, opponent, difficulty)`:
  - On **hard**, it picks the best Minimax move.
  - On **medium**, there’s a small chance to pick a random valid move to keep play less predictable.

---

## 👛 Wallet & Identity

- The app uses `wagmi` + Coinbase **OnchainKit** (`Wallet`, `ConnectWallet`, etc.) to connect a **Base** wallet.
- A glowing **Base logo** is shown in the header when connected.
- The wallet address is used as the **user document ID** in Firestore:
  - `users/{walletAddress}`

All user-specific data is keyed off this wallet address:

- `nickname`
- `wallet` (in-game points/balance)
- `wins`, `losses`, `draws`
- `onlineWins`
- `lastLogin`, `lastGame`

There is a **hard gate**: if no wallet is connected, the app shows a connect-wallet screen and blocks access to gameplay.

---

## 📊 Stats & Leaderboard

### Per-Wallet Stats

Each wallet has a stats block stored in Firestore:

- `wins` – total wins in local/AI games
- `losses`
- `draws`
- `onlineWins` – total wins in online games
- `wallet` – in-game currency balance

A helper `updateStats(result, isOnline)` function adjusts:

- Counts (`wins`, `losses`, `draws`, `onlineWins`)
- Wallet:
  - **Win (online):** +5
  - **Win (local/AI):** +1
  - **Loss (online):** −3 (floored at 0)
  - **Draw:** 0

### Global Leaderboard

The leaderboard is computed from Firestore:

- Collection: `users`
- Sorted by:
  - `onlineWins` (descending)
  - then `wins` (descending)
- Limited to the **top 50** players.

The current user’s row is highlighted in the leaderboard list.

---

## 🌐 Online Game Flow

### Data Model

Online games are stored in:

- `games/{gameId}`

Each document holds:

- `board`: 9-cell array (`"X" | "O" | null`)
- `isXNext`: whose turn it is
- `winner`: `"X" | "O" | null`
- `winningCombo`: indices of winning line, if any
- `isGameOver`
- `gameMode`: `"online"`
- `playerX`, `playerO`: wallet addresses
- `playerXNickname`, `playerONickname`
- `lastUpdated`: timestamp used for conflict resolution

### Lifecycle

1. **Create**
   - Player with a wallet calls `createOnlineGame()`.
   - Generates an 8-character `gameId`.
   - Writes an `initialGameState` document with `playerX = wallet`.

2. **Join**
   - Another wallet enters the `gameId`.
   - A Firestore transaction checks that:
     - The game exists.
     - The room is not full.
     - The joiner is not already `playerX`.
   - Sets `playerO` and `playerONickname`.

3. **Play**
   - Both clients subscribe via `onSnapshot` to `games/{gameId}`.
   - Moves are processed with `handleBoardUpdate`:
     - Updates board.
     - Runs `checkGameResult`.
     - Writes back the new state + `lastUpdated`.

4. **Leave / End**
   - `leaveOnlineGame()` clears the calling player’s slot (`playerX` or `playerO`).
   - If a game doc is deleted, clients detect it and reset back to the selection mode.

---

## 🎨 UI / UX

- **Mobile-first design** optimized for mini app environments.
- Sticky bottom navigation for:
  - Menu
  - Local
  - AI
  - Online
  - Leaderboard
  - Profile/Stats
- Animated `X` and `O` components for a more dynamic board.
- Modal dialog for game over (win / draw) with:
  - “Play Again”
  - “Change Mode”
  - “Leave Online Game” (in online mode).
- Global popup system (`usePopup`) for inline success/error toasts.

---

## 🗂 High-Level Structure

- `app/page.tsx`
  - Main game component and UI.
  - Game logic, state management, AI integration.
  - Firestore interactions for users and games.
  - Wallet gating and Base mini-app-style layout.

- `app/layout.tsx`
  - Global HTML structure.
  - App-level metadata (title, description, Open Graph).

- `Firebase`
  - Initialized at the top of `page.tsx` with `initializeApp`.
  - Firestore obtained via `getFirestore(firebaseApp)`.

---

## 🔮 Possible Extensions

Some ideas for future enhancements:

- Support for small wagers or prize pools (on-chain or off-chain).
- Richer player profiles (avatars, social links, achievements).
- Match history per wallet.
- Spectator mode for online games.
- Multiple board sizes or game variants.

---

## Credits

Game design, UI, and implementation by **anakincoco**.  
Built as a Base-focused mini app experiment using Next.js, Firebase, and wallet-based identity.
