"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  Repeat,
  Home,
  Users,
  Cpu,
  TrendingUp,
  RotateCcw,
  BarChart,
  X as XIcon,
  User,
  DollarSign,
  Loader2,
  Trophy,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  runTransaction,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  where,
} from "firebase/firestore";

import { useAccount } from "wagmi";
import {
  Wallet,
  ConnectWallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";

import miniappSdk from "@farcaster/miniapp-sdk";

// --- Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyDBQPgse6PZn-FQBo8Bv5HF8mNxjXrydl4",
  authDomain: "x-and-o-29358.firebaseapp.com",
  projectId: "x-and-o-29358",
  storageBucket: "x-and-o-29358.firebasestorage.app",
  messagingSenderId: "934577439632",
  appId: "1:934577439632:web:bc8bd3afa14dabbaeea915",
};

let firebaseApp: any = null;
let db: any = null;

try {
  firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp);
} catch (e) {
  console.error("Firebase initialization error:", e);
}

// --- Game Constants and Types ---
const WINNING_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

type Symbol = "X" | "O";
type GameMode = "local" | "ai" | "online";
type Board = (Symbol | null)[];

type PlayerData = {
  nickname: string;
  xoPoints: number;
  walletAddress: string | null;
};

type StakeType = "none" | "points" | "usdc";

type GameState = {
  board: Board;
  isXNext: boolean;
  winner: Symbol | null;
  winningCombo: number[] | null;
  playerX: string | null;
  playerO: string | null;
  gameMode: GameMode;
  lastUpdated: number;
  isGameOver: boolean;
  playerXNickname: string | null;
  playerONickname: string | null;
  hostWallet?: string | null;
  hostNickname?: string | null;
  stakeType?: StakeType;
  stakeAmountPoints?: number | null;
};

type Stats = {
  wins: number;
  losses: number;
  draws: number;
  onlineWins: number;
  onlineLosses: number;
  onlineDraws: number;
  currentStreak: number;
  bestStreak: number;
};

type Match = {
  id: string;
  gameId: string | null;
  players: string[];
  playerX: string | null;
  playerO: string | null;
  playerXNickname?: string | null;
  playerONickname?: string | null;
  winnerSymbol: Symbol | null;
  winnerWallet: string | null;
  loserWallet: string | null;
  createdAt: number;
};

type Badge = {
  id: string;
  label: string;
  emoji: string;
  description: string;
};

// --- Rank helper ---
const getRankLabel = (wins: number) => {
  if (wins >= 20) return "Grandmaster";
  if (wins >= 10) return "Master";
  if (wins >= 5) return "Challenger";
  if (wins >= 1) return "Rookie";
  return "Unranked";
};

// --- Badges helper ---
const getBadges = (xoPoints: number, stats: Stats): Badge[] => {
  const badges: Badge[] = [];

  if (xoPoints >= 12000) {
    badges.push({
      id: "deity",
      label: "Onchain Deity",
      emoji: "👑",
      description: "Massive XO stack. You rule the grid.",
    });
  } else if (xoPoints >= 9000) {
    badges.push({
      id: "whale",
      label: "XO Whale",
      emoji: "🐋",
      description: "You’ve stacked a serious XO bag.",
    });
  } else if (xoPoints >= 7000) {
    badges.push({
      id: "grinder",
      label: "Grinder",
      emoji: "🔥",
      description: "Playing often and stacking XO.",
    });
  }

  if (stats.onlineWins >= 20) {
    badges.push({
      id: "veteran",
      label: "Ranked Veteran",
      emoji: "⚔️",
      description: "20+ online wins.",
    });
  } else if (stats.onlineWins >= 10) {
    badges.push({
      id: "fighter",
      label: "Ranked Fighter",
      emoji: "🥊",
      description: "10+ online wins.",
    });
  }

  if (stats.bestStreak >= 5) {
    badges.push({
      id: "streak",
      label: "Hot Streak",
      emoji: "🔥",
      description: "5+ win streak.",
    });
  }

  if (stats.onlineDraws >= 10) {
    badges.push({
      id: "wall",
      label: "Unbreakable",
      emoji: "🧱",
      description: "10+ online draws.",
    });
  }

  return badges;
};

// --- AI Logic ---
const checkWinner = (board: Board) => {
  for (let [a, b, c] of WINNING_COMBINATIONS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return board[a];
  }
  return null;
};

const minimax = (
  board: Board,
  depth: number,
  isMax: boolean,
  player: Symbol,
  opponent: Symbol
): number => {
  const winner = checkWinner(board);
  if (winner === player) return 10 - depth;
  if (winner === opponent) return depth - 10;
  if (board.every((c) => c !== null)) return 0;

  const available = board
    .map((v, i) => (v === null ? i : null))
    .filter((v) => v !== null) as number[];

  if (isMax) {
    let best = -Infinity;
    for (let i of available) {
      board[i] = player;
      const score = minimax(board, depth + 1, false, player, opponent);
      board[i] = null;
      best = Math.max(score, best);
    }
    return best;
  } else {
    let best = Infinity;
    for (let i of available) {
      board[i] = opponent;
      const score = minimax(board, depth + 1, true, player, opponent);
      board[i] = null;
      best = Math.min(score, best);
    }
    return best;
  }
};

const findBestMove = (
  board: Board,
  player: Symbol,
  opponent: Symbol,
  difficulty: "medium" | "hard"
) => {
  const available = board
    .map((v, i) => (v === null ? i : null))
    .filter((v) => v !== null) as number[];
  if (available.length === 0) return null;

  if (difficulty === "hard") {
    let bestScore = -Infinity,
      bestMove = available[0];
    for (let i of available) {
      board[i] = player;
      const score = minimax(board, 0, false, player, opponent);
      board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
    return bestMove;
  }

  if (Math.random() < 0.2) {
    return available[Math.floor(Math.random() * available.length)];
  } else {
    let bestScore = -Infinity,
      bestMove = available[0];
    for (let i of available) {
      board[i] = player;
      const score = minimax(board, 0, false, player, opponent);
      board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
    return bestMove;
  }
};

// --- Initial States ---
const initialGameState: GameState = {
  board: Array(9).fill(null) as Board,
  isXNext: true,
  winner: null,
  winningCombo: null,
  playerX: null,
  playerO: null,
  gameMode: "local",
  lastUpdated: Date.now(),
  isGameOver: false,
  playerXNickname: null,
  playerONickname: null,
  hostWallet: null,
  hostNickname: null,
  stakeType: "none",
  stakeAmountPoints: null,
};

const initialStats: Stats = {
  wins: 0,
  losses: 0,
  draws: 0,
  onlineWins: 0,
  onlineLosses: 0,
  onlineDraws: 0,
  currentStreak: 0,
  bestStreak: 0,
};

const initialUserData: PlayerData = {
  nickname: "Guest",
  xoPoints: 6000,
  walletAddress: null,
};

// --- Animated X and O (FF Oxmox) ---
const AnimatedX = () => (
  <div className="flex justify-center items-center w-full h-full text-5xl sm:text-6xl text-black">
    <span
      className="duration-300"
      style={{
        fontFamily:
          '"FF Oxmox", system-ui, -apple-system, "Segoe UI", sans-serif',
        letterSpacing: "0.06em",
      }}
    >
      X
    </span>
  </div>
);

const AnimatedO = () => (
  <div className="flex justify-center items-center w-full h-full text-5xl sm:text-6xl text-sky-500">
    <span
      className="duration-300"
      style={{
        fontFamily:
          '"FF Oxmox", system-ui, -apple-system, "Segoe UI", sans-serif',
        letterSpacing: "0.06em",
      }}
    >
      O
    </span>
  </div>
);

// --- Glowing Base Logo ---
const BaseLogoGlow = ({ connected }: { connected: boolean }) => (
  <div className="flex items-center gap-3">
    <div className="relative">
      <div className="h-10 w-10 rounded-full bg-black flex items-center justify-center border border-sky-400/40 overflow-hidden">
        <div
          className={`absolute inset-0 rounded-full blur-xl bg-sky-400/70 transition-opacity ${
            connected ? "opacity-100 animate-pulse" : "opacity-0"
          }`}
        />
        <span className="relative text-[9px] font-semibold tracking-[0.18em] text-white">
          BASE
        </span>
      </div>
    </div>
    <span className="text-xs text-sky-200">
      {connected ? "Base wallet connected" : "Connect Base wallet to start"}
    </span>
  </div>
);

// --- Popup hook ---
type Popup = { id: number; message: string; type: "error" | "info" };
let nextPopupId = 0;

const usePopup = () => {
  const [popups, setPopups] = useState<Popup[]>([]);

  const showPopup = useCallback(
    (
      message: string,
      type: "error" | "info" = "info",
      duration: number = 3000
    ) => {
      const id = nextPopupId++;
      const newPopup: Popup = { id, message, type };
      setPopups((prev) => [...prev, newPopup]);
      setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p.id !== id));
      }, duration);
    },
    []
  );

  const PopupContainer = () => (
    <div className="fixed top-4 right-4 z-[9999] space-y-2">
      {popups.map((p) => (
        <div
          key={p.id}
          className={`p-3 rounded-lg shadow-xl text-white max-w-xs transition-all duration-300 transform ${
            p.type === "error" ? "bg-red-600" : "bg-green-600"
          } animate-in slide-in-from-right`}
        >
          {p.message}
        </div>
      ))}
    </div>
  );

  return { showPopup, PopupContainer };
};

// --- Main App Component ---
const App = () => {
  const { showPopup, PopupContainer } = usePopup();
  const { address, isConnected } = useAccount();

  const [userData, setUserData] = useState<PlayerData>(initialUserData);

  const [mode, setMode] = useState<
    | "selection"
    | "local"
    | "ai"
    | "online"
    | "stats"
    | "leaderboard"
    | "tournament"
    | "wager"
  >("selection");
  const [onlineGameId, setOnlineGameId] = useState<string | null>(null);
  const [localPlayerSymbol, setLocalPlayerSymbol] = useState<Symbol | null>(
    null
  );
  const [aiDifficulty, setAiDifficulty] = useState<"medium" | "hard">("medium");
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [isThinking, setIsThinking] = useState(false);
  const [message, setMessage] = useState("Welcome to X & O!");
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState<Stats>(initialStats);

  const [leaderboardWins, setLeaderboardWins] = useState<any[]>([]);
  const [leaderboardPoints, setLeaderboardPoints] = useState<any[]>([]);
  const [leaderboardMode, setLeaderboardMode] = useState<"wins" | "points">(
    "wins"
  );

  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [theme, setTheme] = useState<"original" | "light">("original");

  const tapSoundRef = useRef<HTMLAudioElement | null>(null);

  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [wagerMode, setWagerMode] = useState<"points" | "usdc">("points");
  const [generatedWagerCode, setGeneratedWagerCode] = useState<string | null>(
    null
  );

  const nicknameInputRef = useRef<HTMLInputElement | null>(null);
  const joinGameIdRef = useRef<HTMLInputElement | null>(null);
  const pointsMatchCodeRef = useRef<HTMLInputElement | null>(null);
  const usdcMatchCodeRef = useRef<HTMLInputElement | null>(null);

  const currentPlayerSymbol: Symbol = gameState.isXNext ? "X" : "O";
  const userWallet = address?.toLowerCase() ?? null;

  const isLocalTurn = useMemo(() => {
    return (
      mode === "local" ||
      (mode === "ai" && currentPlayerSymbol === "X") ||
      (mode === "online" && currentPlayerSymbol === localPlayerSymbol)
    );
  }, [mode, currentPlayerSymbol, localPlayerSymbol]);

  // Load theme
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("xo_theme");
    if (stored === "light" || stored === "original") {
      setTheme(stored);
    }
  }, []);

  const setThemeAndPersist = (value: "original" | "light") => {
    setTheme(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("xo_theme", value);
    }
  };

  // tap sound
  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio("/sounds/tap.mp3");
    audio.volume = 0.35;
    tapSoundRef.current = audio;
  }, []);

  // Farcaster ready
  useEffect(() => {
    try {
      miniappSdk.actions.ready();
    } catch {
      // ignore
    }
  }, []);

  // Wallet-based user data + stats (XO points)
  useEffect(() => {
    if (!db || !userWallet) return;

    const userDocRef = doc(db, "users", userWallet);

    const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        const nicknameFromDb =
          data.nickname || `Player_${userWallet.slice(2, 6).toUpperCase()}`;

        // --- XO reset logic: ensure default 6000 if missing/invalid ---
        let xoPointsFromDb: number;
        if (typeof data.xoPoints === "number") {
          xoPointsFromDb = data.xoPoints;
        } else if (typeof data.wallet === "number") {
          xoPointsFromDb = data.wallet;
        } else {
          xoPointsFromDb = 6000;
        }

        let normalizedXo = xoPointsFromDb;
        if (!data.xoPoints || data.xoPoints <= 0) {
          normalizedXo = 6000; // reset to default for this wallet
          setDoc(
            userDocRef,
            { xoPoints: normalizedXo, lastUpdated: Date.now() },
            { merge: true }
          ).catch((e) =>
            console.error("Error normalizing XO points for user:", e)
          );
        }

        setUserData((prev) => ({
          ...prev,
          walletAddress: userWallet,
          nickname: nicknameFromDb,
          xoPoints: normalizedXo,
        }));
        setStats({
          wins: data.wins || 0,
          losses: data.losses || 0,
          draws: data.draws || 0,
          onlineWins: data.onlineWins || 0,
          onlineLosses: data.onlineLosses || 0,
          onlineDraws: data.onlineDraws || 0,
          currentStreak: data.currentStreak || 0,
          bestStreak: data.bestStreak || 0,
        });
      } else {
        const newUserData = {
          nickname: `Player_${userWallet.slice(2, 6).toUpperCase()}`,
          xoPoints: 6000,
          walletAddress: userWallet,
          lastLogin: Date.now(),
        };
        setDoc(userDocRef, newUserData, { merge: true }).catch((e) =>
          console.error("Error setting initial user doc:", e)
        );
      }
    });

    return () => unsubscribeUser();
  }, [userWallet]);

  // Nickname update (uncontrolled input)
  const updateNickname = async () => {
    if (!userWallet || !db || !nicknameInputRef.current) return;
    const value = nicknameInputRef.current.value.trim();
    if (!value) return;

    try {
      await setDoc(
        doc(db, "users", userWallet),
        { nickname: value, lastUpdated: Date.now() },
        { merge: true }
      );
      showPopup("Nickname updated!", "info");
    } catch {
      showPopup("Failed to update nickname.", "error");
    }
  };

  // --- Online Game Functions (ranked, no stake) ---
  const createOnlineGame = async () => {
    if (!userWallet || !db) {
      showPopup("Connect your Base wallet first.", "error");
      return;
    }
    try {
      const gameId = Math.random().toString(36).substring(2, 10).toUpperCase();
      const gameDocRef = doc(db, "games", gameId);

      const initial: GameState = {
        ...initialGameState,
        gameMode: "online",
        playerX: null,
        playerO: null,
        lastUpdated: Date.now(),
        playerXNickname: null,
        playerONickname: null,
        hostWallet: userWallet,
        hostNickname: userData.nickname,
        stakeType: "none",
        stakeAmountPoints: null,
      };

      await setDoc(gameDocRef, initial);
      setOnlineGameId(gameId);
      setLocalPlayerSymbol(null);
      setMode("online");
      setMessage(
        `Game ${gameId} created. Waiting for opponent… sides will be random.`
      );
    } catch (e: any) {
      console.error(e);
      showPopup(`Failed to create game: ${e.message}`, "error");
    }
  };

  // --- Points Stake Game Creation ---
  const createPointsGameWithStake = async (bet: number) => {
    if (!userWallet || !db) {
      showPopup("Connect your Base wallet first.", "error");
      return;
    }
    if (bet <= 0) {
      showPopup("Choose a valid XO stake.", "error");
      return;
    }
    if (userData.xoPoints < bet) {
      showPopup("Not enough XO points to host this stake.", "error");
      return;
    }

    try {
      const gameId = Math.random().toString(36).substring(2, 10).toUpperCase();
      const gameDocRef = doc(db, "games", gameId);

      const initial: GameState = {
        ...initialGameState,
        gameMode: "online",
        playerX: null,
        playerO: null,
        lastUpdated: Date.now(),
        playerXNickname: null,
        playerONickname: null,
        hostWallet: userWallet,
        hostNickname: userData.nickname,
        stakeType: "points",
        stakeAmountPoints: bet,
      };

      await setDoc(gameDocRef, initial);
      setOnlineGameId(gameId);
      setLocalPlayerSymbol(null);
      setMode("online");
      setMessage(
        `Points Match ${gameId} created with ${bet} XO stake. Share the code; sides are random.`
      );
      setGeneratedWagerCode(gameId);
    } catch (e: any) {
      console.error(e);
      showPopup(`Failed to create stake game: ${e.message}`, "error");
    }
  };

  const joinOnlineGame = async (gameIdInputValue: string) => {
    if (!userWallet || !db || !gameIdInputValue) {
      showPopup("Connect your Base wallet and enter a game ID.", "error");
      return;
    }

    const cleanId = gameIdInputValue.trim().toUpperCase();
    let assignedSymbol: Symbol | null = null;

    try {
      await runTransaction(db, async (transaction: any) => {
        const gameDocRef = doc(db, "games", cleanId);
        const gameDoc = await transaction.get(gameDocRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");

        const data = gameDoc.data() as any;

        if (data.playerX && data.playerO) throw new Error("Room full.");
        if (data.hostWallet === userWallet)
          throw new Error("You already created this game.");

        if (data.stakeType === "points") {
          const bet = data.stakeAmountPoints || 0;
          const hostWallet = data.hostWallet as string | undefined;

          if (!hostWallet || bet <= 0) {
            throw new Error("Invalid stake game configuration.");
          }

          const hostRef = doc(db, "users", hostWallet.toLowerCase());
          const joinerRef = doc(db, "users", userWallet);

          const hostDoc = await transaction.get(hostRef);
          const joinerDoc = await transaction.get(joinerRef);

          if (!hostDoc.exists() || !joinerDoc.exists()) {
            throw new Error("Player profile not found for stake.");
          }

          const hostData = hostDoc.data() as any;
          const joinerData = joinerDoc.data() as any;

          const hostPoints =
            hostData.xoPoints !== undefined
              ? hostData.xoPoints
              : hostData.wallet || 6000;
          const joinerPoints =
            joinerData.xoPoints !== undefined
              ? joinerData.xoPoints
              : joinerData.wallet || 6000;

          if (hostPoints < bet || joinerPoints < bet) {
            throw new Error("Insufficient XO points for this stake match.");
          }
        }

        const hostWallet: string = data.hostWallet;
        const hostNickname: string =
          data.hostNickname || `Player_${hostWallet.slice(2, 6).toUpperCase()}`;

        const joinerWallet = userWallet;
        const joinerNickname = userData.nickname;

        const hostIsX = Math.random() < 0.5;

        const playerX = hostIsX ? hostWallet : joinerWallet;
        const playerO = hostIsX ? joinerWallet : hostWallet;

        const playerXNickname = hostIsX ? hostNickname : joinerNickname;
        const playerONickname = hostIsX ? joinerNickname : hostNickname;

        assignedSymbol = playerX === joinerWallet ? "X" : "O";

        transaction.update(gameDocRef, {
          playerX,
          playerO,
          playerXNickname,
          playerONickname,
          lastUpdated: Date.now(),
        });
      });

      setOnlineGameId(cleanId);
      setLocalPlayerSymbol(assignedSymbol);
      setMode("online");
      setMessage(
        `Joined Game ${cleanId}. You are ${assignedSymbol}. Good luck!`
      );
    } catch (e: any) {
      console.error(e);
      const msg = e.message.includes("not found")
        ? "Game not found"
        : e.message.includes("full")
        ? "Room full"
        : e.message.includes("Insufficient XO points")
        ? e.message
        : e.message;
      showPopup(msg, "error");
    }
  };

  const leaveOnlineGame = async () => {
    if (!onlineGameId || !db) return;

    try {
      const gameDocRef = doc(db, "games", onlineGameId);
      const updateData: Partial<GameState> & { lastUpdated: number } = {
        lastUpdated: Date.now(),
      };

      if (localPlayerSymbol === "X") {
        updateData.playerX = null;
        updateData.playerXNickname = null;
      } else if (localPlayerSymbol === "O") {
        updateData.playerO = null;
        updateData.playerONickname = null;
      }
      await setDoc(gameDocRef, updateData, { merge: true });
      showPopup("Successfully left the game.", "info");
    } catch (e) {
      console.error("Failed to leave game:", e);
      showPopup("Failed to leave game.", "error");
    }

    setOnlineGameId(null);
    setLocalPlayerSymbol(null);
    setMode("selection");
    setGameState(initialGameState);
    setMessage("Left online mode.");
  };

  // --- Log online match ---
  const logOnlineMatch = async (winner: Symbol | null) => {
    if (!db || !onlineGameId) return;
    if (!gameState.playerX || !gameState.playerO) return;

    const hostWallet = (gameState.hostWallet || null) as string | null;
    if (!hostWallet || !userWallet || hostWallet.toLowerCase() !== userWallet) {
      return;
    }

    const playerXWallet = gameState.playerX.toLowerCase();
    const playerOWallet = gameState.playerO.toLowerCase();

    let winnerWallet: string | null = null;
    let loserWallet: string | null = null;

    if (winner === "X") {
      winnerWallet = playerXWallet;
      loserWallet = playerOWallet;
    } else if (winner === "O") {
      winnerWallet = playerOWallet;
      loserWallet = playerXWallet;
    }

    try {
      await addDoc(collection(db, "matches"), {
        gameId: onlineGameId,
        players: [playerXWallet, playerOWallet],
        playerX: playerXWallet,
        playerO: playerOWallet,
        playerXNickname: gameState.playerXNickname,
        playerONickname: gameState.playerONickname,
        winnerSymbol: winner,
        winnerWallet,
        loserWallet,
        createdAt: Date.now(),
      });
    } catch (e) {
      console.error("Failed to log match:", e);
    }
  };

  // --- Apply XO points stake ---
  const applyStakePoints = useCallback(
    async (
      winner: Symbol | null,
      bet: number,
      playerXWallet: string,
      playerOWallet: string
    ) => {
      if (!db) return;
      if (!winner || bet <= 0) return;

      const winnerWallet =
        winner === "X" ? playerXWallet.toLowerCase() : playerOWallet.toLowerCase();
      const loserWallet =
        winner === "X" ? playerOWallet.toLowerCase() : playerXWallet.toLowerCase();

      const winnerRef = doc(db, "users", winnerWallet);
      const loserRef = doc(db, "users", loserWallet);

      try {
        await runTransaction(db, async (tx: any) => {
          const winnerDoc = await tx.get(winnerRef);
          const loserDoc = await tx.get(loserRef);
          if (!winnerDoc.exists() || !loserDoc.exists()) return;

          const wData = winnerDoc.data() as any;
          const lData = loserDoc.data() as any;

          const wPts =
            wData.xoPoints !== undefined
              ? wData.xoPoints
              : wData.wallet || 6000;
          const lPts =
            lData.xoPoints !== undefined
              ? lData.xoPoints
              : lData.wallet || 6000;

          const newWinner = wPts + bet;
          const newLoser = Math.max(0, lPts - bet);

          tx.update(winnerRef, { xoPoints: newWinner });
          tx.update(loserRef, { xoPoints: newLoser });
        });
      } catch (e) {
        console.error("Failed to apply stake points:", e);
      }
    },
    []
  );

  // --- Online listener ---
  useEffect(() => {
    if (mode !== "online" || !onlineGameId || !db) return;

    const gameDocRef = doc(db, "games", onlineGameId);
    const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;

        setGameState((prev) => {
          if (
            typeof data.lastUpdated === "number" &&
            data.lastUpdated > prev.lastUpdated
          ) {
            const newState: GameState = {
              ...prev,
              ...data,
            };

            if (userWallet) {
              if (newState.playerX === userWallet) {
                setLocalPlayerSymbol("X");
              } else if (newState.playerO === userWallet) {
                setLocalPlayerSymbol("O");
              }
            }

            const winner = checkWinner(newState.board);
            if (newState.isGameOver) {
              setMessage(
                winner
                  ? `Game Over! Player ${winner} Wins! 🎉`
                  : "It's a Draw! 🤝"
              );
              setShowModal(true);
            } else if (!newState.playerO || !newState.playerX) {
              setMessage(`Game ${onlineGameId}: Waiting for opponent...`);
            } else {
              setMessage(
                `Game ${onlineGameId}: ${newState.playerXNickname} (X) vs ${
                  newState.playerONickname
                } (O) - ${newState.isXNext ? "X" : "O"}'s Turn`
              );
            }
            return newState;
          }
          return prev;
        });
      } else {
        setMessage("Game ended or deleted by opponent.");
        setOnlineGameId(null);
        setLocalPlayerSymbol(null);
        setMode("selection");
        showPopup("Game not found or ended.", "error");
      }
    });

    return () => unsubscribe();
  }, [mode, onlineGameId, userWallet, showPopup]);

  // --- Stats update ---
  const updateStats = useCallback(
    async (result: "win" | "loss" | "draw", isOnline: boolean) => {
      if (!userWallet || !db) return;
      const userDocRef = doc(db, "users", userWallet);

      await runTransaction(db, async (transaction: any) => {
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists()) return;

        const data = userDoc.data() as any;
        const update: any = { lastGame: Date.now() };

        const wins = data.wins || 0;
        const losses = data.losses || 0;
        const draws = data.draws || 0;

        let newWins = wins;
        let newLosses = losses;
        let newDraws = draws;

        if (result === "win") {
          newWins = wins + 1;
        } else if (result === "loss") {
          newLosses = losses + 1;
        } else {
          newDraws = draws + 1;
        }

        update.wins = newWins;
        update.losses = newLosses;
        update.draws = newDraws;

        const prevStreak = data.currentStreak || 0;
        const prevBest = data.bestStreak || 0;
        let newStreak = prevStreak;
        let newBest = prevBest;

        if (result === "win") {
          newStreak = prevStreak + 1;
          newBest = Math.max(newStreak, prevBest);
        } else if (result === "loss") {
          newStreak = 0;
        }

        update.currentStreak = newStreak;
        update.bestStreak = newBest;

        if (isOnline) {
          const onlineWins = data.onlineWins || 0;
          const onlineLosses = data.onlineLosses || 0;
          const onlineDraws = data.onlineDraws || 0;

          if (result === "win") {
            update.onlineWins = onlineWins + 1;
          } else if (result === "loss") {
            update.onlineLosses = onlineLosses + 1;
          } else {
            update.onlineDraws = onlineDraws + 1;
          }
        }

        transaction.update(userDocRef, update);
      });
    },
    [userWallet]
  );

  const checkGameResult = useCallback(
    (board: Board, newIsXNext: boolean) => {
      const winner = checkWinner(board);
      const draw = board.every((c) => c !== null);
      let status = "";
      const winningCombo =
        winner &&
        (WINNING_COMBINATIONS.find(
          ([a, b, c]) =>
            board[a] === winner && board[b] === winner && board[c] === winner
        ) || null);

      const resultState: Partial<GameState> & {
        board: Board;
        isXNext: boolean;
        winner: Symbol | null;
        isGameOver: boolean;
        winningCombo: number[] | null;
      } = {
        board,
        isXNext: newIsXNext,
        winner,
        winningCombo,
        isGameOver: !!winner || draw,
      };

      if (resultState.isGameOver) {
        setShowModal(true);
        if (winner) {
          status = `Game Over! Player ${winner} Wins! 🎉`;
          const playerSymbol = mode === "ai" ? "X" : localPlayerSymbol;
          const res = winner === playerSymbol ? "win" : "loss";
          updateStats(res, mode === "online");

          if (mode === "online") {
            logOnlineMatch(winner);

            if (
              gameState.stakeType === "points" &&
              gameState.stakeAmountPoints &&
              gameState.playerX &&
              gameState.playerO
            ) {
              applyStakePoints(
                winner,
                gameState.stakeAmountPoints,
                gameState.playerX,
                gameState.playerO
              );
            }
          }
        } else {
          status = "It's a Draw! 🤝";
          updateStats("draw", mode === "online");

          if (mode === "online") {
            logOnlineMatch(null);
          }
        }
      } else {
        status = `Player ${newIsXNext ? "X" : "O"}'s Turn`;
      }

      return { ...resultState, message: status };
    },
    [
      mode,
      localPlayerSymbol,
      updateStats,
      gameState.stakeType,
      gameState.stakeAmountPoints,
      gameState.playerX,
      gameState.playerO,
      applyStakePoints,
    ]
  );

  const handleBoardUpdate = useCallback(
    async (index: number, symbol: Symbol) => {
      const { board, winner, isGameOver } = gameState;
      if (board[index] || winner || isGameOver) return;

      const newBoard = [...board];
      newBoard[index] = symbol;
      const result = checkGameResult(newBoard, !gameState.isXNext);

      if (mode === "online" && onlineGameId && db) {
        const gameDocRef = doc(db, "games", onlineGameId);
        const updateData: Partial<GameState> & {
          lastUpdated: number;
          board: Board;
          isXNext: boolean;
          winner: Symbol | null;
          winningCombo: number[] | null;
          isGameOver: boolean;
          message: string;
        } = {
          ...(result as any),
          lastUpdated: Date.now(),
        };
        if (symbol === "X") updateData.playerXNickname = userData.nickname;
        if (symbol === "O") updateData.playerONickname = userData.nickname;

        await setDoc(gameDocRef, updateData, { merge: true }).catch((e) =>
          console.error("Firebase update error:", e)
        );
      } else {
        setGameState((prev) => ({ ...prev, ...(result as any) }));
        setMessage(result.message);
      }
    },
    [gameState, mode, onlineGameId, checkGameResult, userData.nickname]
  );

  // --- AI move effect (after handleBoardUpdate) ---
  useEffect(() => {
    if (
      mode === "ai" &&
      currentPlayerSymbol === "O" &&
      !gameState.winner &&
      !gameState.board.every((c) => c !== null) &&
      !isThinking
    ) {
      setIsThinking(true);
      setTimeout(() => {
        const aiMove = findBestMove(
          [...gameState.board],
          "O",
          "X",
          aiDifficulty
        );
        if (aiMove !== null) handleBoardUpdate(aiMove, "O");
        setIsThinking(false);
      }, 500);
    }
  }, [
    mode,
    currentPlayerSymbol,
    gameState.board,
    gameState.winner,
    isThinking,
    aiDifficulty,
    handleBoardUpdate,
  ]);

  const handleClick = (index: number) => {
    if (!isLocalTurn || isThinking) return;
    if (gameState.board[index]) return;

    if (tapSoundRef.current) {
      try {
        tapSoundRef.current.currentTime = 0;
        tapSoundRef.current.play().catch(() => {});
      } catch {
        // ignore
      }
    }

    handleBoardUpdate(index, currentPlayerSymbol);
  };

  const handleRestart = (newMode: GameMode) => {
    setGameState(initialGameState);
    setShowModal(false);
    setIsThinking(false);
    if (newMode === "online" && onlineGameId) {
      if (localPlayerSymbol === "X" && db) {
        const gameDocRef = doc(db, "games", onlineGameId);
        setDoc(gameDocRef, initialGameState, { merge: true });
      }
      setMessage(`Online Mode: Waiting for host (X) to restart.`);
    } else {
      setMessage(
        newMode === "ai"
          ? `AI Mode: ${aiDifficulty} - X starts`
          : `${newMode} Mode: X starts`
      );
    }
  };

  // --- Leaderboard fetch ---
  useEffect(() => {
    if (mode === "leaderboard" && db) {
      const fetchLeaderboard = async () => {
        try {
          const usersRef = collection(db, "users");

          const qWins = query(
            usersRef,
            orderBy("onlineWins", "desc"),
            limit(50)
          );
          const snapWins = await getDocs(qWins);
          const topWins = snapWins.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setLeaderboardWins(topWins);

          const qPoints = query(
            usersRef,
            orderBy("xoPoints", "desc"),
            limit(50)
          );
          const snapPoints = await getDocs(qPoints);
          const topPoints = snapPoints.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setLeaderboardPoints(topPoints);
        } catch (e) {
          console.error("Error fetching leaderboard:", e);
          showPopup("Failed to load leaderboard.", "error");
        }
      };
      fetchLeaderboard();
    }
  }, [mode, showPopup]);

  // --- Recent matches fetch ---
  useEffect(() => {
    if (mode !== "stats" || !db || !userWallet) return;

    const fetchMatches = async () => {
      try {
        const matchesRef = collection(db, "matches");
        const qMatches = query(
          matchesRef,
          where("players", "array-contains", userWallet),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        const snap = await getDocs(qMatches);
        const items: Match[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setRecentMatches(items);
      } catch (e) {
        console.error("Error fetching recent matches:", e);
      }
    };

    fetchMatches();
  }, [mode, userWallet]);

  // 1v1 Wager (USDC) handlers
  const handleCreateWagerLobby = () => {
    if (!stakeAmount || Number(stakeAmount) <= 0) {
      showPopup("Enter a valid stake amount in USDC.", "error");
      return;
    }
    if (!userWallet) {
      showPopup("Connect your Base wallet first.", "error");
      return;
    }

    const code = "XO" + Math.random().toString(36).substring(2, 8).toUpperCase();
    setGeneratedWagerCode(code);

    showPopup(
      `Prototype only: created 1v1 USDC code ${code}. Wire this to your USDC escrow contract before using with real funds.`,
      "info"
    );
  };

  const handleJoinWagerLobby = () => {
    const code = usdcMatchCodeRef.current?.value.trim() || "";
    if (!code) {
      showPopup("Enter a valid 1v1 match code.", "error");
      return;
    }
    if (!stakeAmount || Number(stakeAmount) <= 0) {
      showPopup("Enter the agreed stake amount in USDC.", "error");
      return;
    }
    if (!userWallet) {
      showPopup("Connect your Base wallet first.", "error");
      return;
    }

    showPopup(
      `Prototype only: would join USDC match ${code}. Connect this to your escrow contract logic.`,
      "info"
    );
  };

  // --- UI blocks ---
  const Cell = ({
    value,
    index,
    winning,
  }: {
    value: Symbol | null;
    index: number;
    winning: boolean;
  }) => (
    <div
      className={`cell flex justify-center items-center text-7xl font-black cursor-pointer shadow-inner transition-colors duration-200 active:scale-95 ${
        winning
          ? "bg-yellow-400/80 text-gray-900"
          : "bg-white hover:bg-gray-100"
      } ${value === "X" ? "text-black" : "text-sky-500"}`}
      onClick={() => handleClick(index)}
    >
      {value === "X" ? <AnimatedX /> : value === "O" ? <AnimatedO /> : null}
    </div>
  );

  const RenderBoard = () => (
    <div className="grid grid-cols-3 grid-rows-3 w-full max-w-sm aspect-square bg-gray-700 rounded-xl shadow-2xl overflow-hidden border-4 border-gray-800">
      {gameState.board.map((v, i) => (
        <Cell
          key={i}
          value={v as Symbol | null}
          index={i}
          winning={!!gameState.winningCombo?.includes(i)}
        />
      ))}
    </div>
  );

  const HeaderBar = () => {
    const totalGames = stats.wins + stats.losses + stats.draws;
    const badges = getBadges(userData.xoPoints, stats);
    const primaryBadge = badges[0];

    return (
      <div className="w-full max-w-md flex justify-between items-center p-3 bg-slate-900/80 rounded-2xl shadow-lg mb-4 text-white border border-slate-700">
        <BaseLogoGlow connected={!!userWallet} />
        <div className="flex flex-col items-end space-y-1">
          <div className="flex items-center space-x-2">
            <User size={18} className="text-indigo-400" />
            <span
              className="text-sm font-semibold truncate max-w-[140px]"
              style={{
                fontFamily:
                  '"Comic Neue", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              {userData.nickname}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <DollarSign size={16} className="text-emerald-400" />
              <span className="text-sm font-semibold">
                {userData.xoPoints} XO
              </span>
            </div>
            <span className="text-[11px] text-gray-300">
              {totalGames} total games
            </span>
          </div>
          {primaryBadge && (
            <div className="flex items-center gap-1 text-[11px] mt-1">
              <span>{primaryBadge.emoji}</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-600 text-slate-100">
                {primaryBadge.label}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const HeroAnimatedXO = () => (
    <div className="w-full max-w-sm mb-5">
      <div className="relative rounded-3xl bg-gradient-to-br from-sky-500/20 via-indigo-500/15 to-purple-500/25 border border-sky-500/40 shadow-[0_0_40px_rgba(56,189,248,0.45)] overflow-hidden p-4">
        <div className="pointer-events-none absolute -top-10 -left-10 h-24 w-24 rounded-full bg-sky-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-0 h-32 w-32 rounded-full bg-purple-500/40 blur-3xl" />

        <div className="relative flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-sky-200/80">
                Onchain Duel
              </p>
              <h2 className="text-lg font-extrabold text-white">
                X &amp; O Highlight
              </h2>
              <p className="text-[11px] text-slate-100/80 mt-1 max-w-[200px]">
                Tap a tile, outplay the board, and climb the Base ladder.
              </p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-black/60 border border-slate-600/60 flex items-center justify-center">
              <Cpu size={22} className="text-sky-300" />
            </div>
          </div>

          <div className="mt-1 grid grid-cols-3 grid-rows-3 gap-1 rounded-2xl bg-slate-950/70 p-2 border border-slate-700/80">
            {Array.from({ length: 9 }).map((_, idx) => {
              const isCenter = idx === 4;
              const isXSpot = idx === 0 || idx === 8;
              const isOSpot = idx === 2 || idx === 6;

              return (
                <div
                  key={idx}
                  className={`h-10 w-full rounded-xl bg-slate-900/90 flex items-center justify-center overflow-hidden ${
                    isCenter ? "border border-sky-500/50" : ""
                  }`}
                >
                  {isXSpot && (
                    <span
                      className="text-xl font-black text-black"
                      style={{
                        fontFamily:
                          '"FF Oxmox", system-ui, -apple-system, "Segoe UI", sans-serif',
                        letterSpacing: "0.06em",
                      }}
                    >
                      X
                    </span>
                  )}
                  {isOSpot && (
                    <span
                      className="text-xl font-black text-sky-400"
                      style={{
                        fontFamily:
                          '"FF Oxmox", system-ui, -apple-system, "Segoe UI", sans-serif',
                        letterSpacing: "0.06em",
                      }}
                    >
                      O
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-sky-100/80 mt-1">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live turns
            </span>
            <span className="uppercase tracking-[0.18em] text-sky-200/80">
              Base Mini App
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const RenderOnlineSetup = () => (
    <div className="w-full flex flex-col items-center bg-gradient-to-br from-emerald-700 to-emerald-800 p-4 rounded-2xl shadow-lg text-white space-y-4 border border-emerald-500/40 mt-1">
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-black/40 flex items-center justify-center">
            <TrendingUp size={20} className="text-emerald-200" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Online Ranked</h3>
            <p className="text-[11px] text-emerald-100/90">
              Create or join a game by code. Sides (X/O) are assigned randomly.
              No XO staking required here.
            </p>
          </div>
        </div>
        <div className="text-right text-[11px] text-emerald-100/80">
          <p>Mode</p>
          <p className="font-semibold">Ranked 1v1</p>
        </div>
      </div>

      {!isConnected || !userWallet ? (
        <p className="text-yellow-200 text-xs text-center bg-black/20 rounded-xl px-3 py-2">
          Connect your Base wallet above to play ranked online.
        </p>
      ) : onlineGameId && gameState.stakeType !== "points" ? (
        <div className="w-full space-y-2 bg-black/20 rounded-xl p-3 border border-emerald-400/40">
          <p className="text-xs text-emerald-100/90">
            In Ranked Game:{" "}
            <span className="font-mono bg-black/40 px-2 py-1 rounded">
              {onlineGameId}
            </span>
          </p>
          <p className="text-xs text-emerald-50/90">
            Your side:{" "}
            <span className="font-semibold">
              {localPlayerSymbol ?? "TBD (random)"}
            </span>
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setMode("online")}
              className="flex-1 p-2 bg-emerald-500 rounded-lg hover:bg-emerald-400 font-semibold text-xs"
            >
              Go To Game
            </button>
            <button
              onClick={leaveOnlineGame}
              className="flex-1 text-xs bg-red-500/80 hover:bg-red-400 rounded-lg font-semibold"
            >
              Leave
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={createOnlineGame}
            className="w-full p-3 bg-emerald-900 rounded-lg hover:bg-emerald-700 font-semibold text-xs flex items-center justify-center gap-2"
          >
            <span>➕ Create Ranked Game</span>
            <span className="text-[10px] bg-black/40 px-2 py-0.5 rounded-full">
              Random X / O
            </span>
          </button>

          <div className="w-full bg-black/20 rounded-xl p-3 border border-emerald-400/40 space-y-2">
            <p className="text-[11px] text-emerald-100/90">
              Or join a friend&apos;s ranked lobby:
            </p>
            <input
              ref={joinGameIdRef}
              type="text"
              placeholder="Enter Room Code (e.g. 8G4KQZ)"
              className="w-full p-2 rounded-lg bg-slate-950/80 border border-emerald-300/60 text-center font-mono text-sm text-white placeholder-emerald-100/60 outline-none focus:border-white"
              maxLength={12}
            />
            <button
              onClick={() =>
                joinOnlineGame(joinGameIdRef.current?.value || "")
              }
              className="w-full p-2 rounded-lg font-semibold text-xs transition bg-emerald-500 hover:bg-emerald-400"
            >
              Join Ranked Game
            </button>
          </div>
        </>
      )}
    </div>
  );

  const RenderSelection = () => (
    <div className="flex flex-col items-center w-full max-w-sm space-y-4">
      <HeroAnimatedXO />

      {/* NEW: Fast access to XO betting mode */}
      <div className="w-full rounded-2xl bg-gradient-to-r from-emerald-600/40 via-emerald-700/40 to-slate-900/90 border border-emerald-400/60 p-4 flex flex-col gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-black/40 flex items-center justify-center">
            <Users size={20} className="text-emerald-200" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-emerald-50">
              Play by betting XO points
            </h3>
            <p className="text-[11px] text-emerald-100/90">
              Host or join 1v1 matches where both players stake XO points. The
              winner takes the pot.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setWagerMode("points");
            setMode("wager");
          }}
          className="self-end px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold uppercase tracking-[0.18em]"
        >
          Go
        </button>
      </div>

      {/* Quick AI */}
      <div className="w-full rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-900/40 border border-purple-500/40 p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-black/40 flex items-center justify-center">
            <Cpu size={20} className="text-white" />
          </div>
        <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">Quick AI</h3>
            <p className="text-[11px] text-slate-200/80">
              Play against AI instantly. This mode does not change your XO
              points—perfect for warm-ups.
            </p>
          </div>
        </div>
        <div className="flex justify-between mt-3">
          <button
            onClick={() => {
              setAiDifficulty("medium");
              setMode("ai");
              handleRestart("ai");
            }}
            className={`py-2 px-4 rounded-full font-semibold text-[11px] bg-purple-900/80 hover:bg-purple-800`}
          >
            Medium
          </button>
          <button
            onClick={() => {
              setAiDifficulty("hard");
              setMode("ai");
              handleRestart("ai");
            }}
            className={`py-2 px-4 rounded-full font-semibold text-[11px] bg-purple-500/80 hover:bg-purple-400 text-black`}
          >
            Hard
          </button>
        </div>
      </div>

      {/* Ranked Online */}
      <RenderOnlineSetup />
    </div>
  );

  const RenderSettings = () => {
    const totalGames = stats.wins + stats.losses + stats.draws;
    const totalOnlineGames =
      stats.onlineWins + stats.onlineLosses + stats.onlineDraws;
    const onlineWinRate =
      totalOnlineGames > 0
        ? Math.round((stats.onlineWins / totalOnlineGames) * 100)
        : 0;

    const badges = getBadges(userData.xoPoints, stats);

    return (
      <div className="flex flex-col items-center w-full max-w-sm p-4 bg-gray-900/90 rounded-xl text-white space-y-4 border border-slate-700/80">
        <div className="w-full flex flex-col items-center gap-1">
          <h2 className="text-2xl font-bold">Profile</h2>
          <p
            className="text-lg px-3 py-1 rounded-full bg-slate-800/80 border border-slate-600/80"
            style={{
              fontFamily:
                '"Comic Neue", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            {userData.nickname}
          </p>
        </div>

        {/* Nickname */}
        <div className="w-full p-3 rounded-xl bg-slate-900/80 border border-slate-600/80 space-y-2">
          <label htmlFor="nickname" className="text-xs font-semibold">
            Edit nickname
          </label>
          <div className="flex space-x-2">
            <input
              id="nickname"
              ref={nicknameInputRef}
              type="text"
              defaultValue={userData.nickname}
              className="flex-grow p-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white placeholder-gray-500 outline-none focus:border-sky-400"
              maxLength={15}
              placeholder="Type your new nickname"
            />
            <button
              onClick={updateNickname}
              className="px-3 rounded-lg font-semibold text-xs transition bg-indigo-600 hover:bg-indigo-700"
            >
              Save
            </button>
          </div>
        </div>

        {/* XO points */}
        <div className="w-full p-3 bg-gray-800 rounded-lg flex justify-between items-center">
          <span className="font-semibold text-sm">XO Points</span>
          <span className="flex items-center text-sm">
            <DollarSign size={16} className="text-emerald-400 mr-1" />
            {userData.xoPoints}
          </span>
        </div>

        {userWallet && (
          <div className="w-full p-3 bg-gray-800 rounded-lg text-xs break-all text-gray-300">
            Wallet address: {userWallet}
          </div>
        )}

        {/* Theme */}
        <div className="w-full mt-1 p-4 rounded-xl bg-slate-900/80 border border-slate-600/70 space-y-3">
          <h3 className="text-sm font-semibold mb-1">Theme</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setThemeAndPersist("original")}
              className={`flex-1 py-2 rounded-full text-xs font-semibold border transition ${
                theme === "original"
                  ? "bg-sky-500 text-black border-sky-400"
                  : "bg-slate-800 text-slate-200 border-slate-600 hover:border-sky-400"
              }`}
            >
              Original Dark
            </button>
            <button
              onClick={() => setThemeAndPersist("light")}
              className={`flex-1 py-2 rounded-full text-xs font-semibold border transition ${
                theme === "light"
                  ? "bg-slate-800 text-slate-100 border-sky-400"
                  : "bg-slate-800 text-slate-200 border-slate-600 hover:border-sky-400"
              }`}
            >
              Neutral Dark
            </button>
          </div>
        </div>

        {/* Badges */}
        <div className="w-full mt-1 p-4 rounded-xl bg-slate-900/80 border border-slate-600 space-y-3">
          <h3 className="text-sm font-semibold">Badges</h3>
          {badges.length === 0 ? (
            <p className="text-xs text-gray-400">
              No badges yet. Earn XO points and online wins to unlock badges.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <div
                  key={badge.id}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800 border border-slate-600 text-[11px]"
                >
                  <span>{badge.emoji}</span>
                  <span className="font-semibold">{badge.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="w-full mt-2 p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-600/60 shadow-inner space-y-3">
          <h3 className="text-lg font-semibold mb-1 flex items-center">
            <BarChart size={18} className="mr-2 text-sky-400" />
            Game Stats
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-slate-900/60 rounded-lg p-2 flex flex-col">
              <span className="text-xs text-gray-400">Games Played</span>
              <span className="text-lg font-bold">{totalGames}</span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 flex flex-col">
              <span className="text-xs text-gray-400">Online Games</span>
              <span className="text-lg font-bold">{totalOnlineGames}</span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 flex flex-col">
              <span className="text-xs text-gray-400">Online Wins</span>
              <span className="text-lg font-bold text-emerald-400">
                {stats.onlineWins}
              </span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 flex flex-col">
              <span className="text-xs text-gray-400">Online Win Rate</span>
              <span className="text-lg font-bold">
                {onlineWinRate}
                <span className="text-xs ml-1">%</span>
              </span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 flex flex-col">
              <span className="text-xs text-gray-400">Current Streak</span>
              <span className="text-lg font-bold text-emerald-300">
                {stats.currentStreak}
              </span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 flex flex-col">
              <span className="text-xs text-gray-400">Best Streak</span>
              <span className="text-lg font-bold text-yellow-300">
                {stats.bestStreak}
              </span>
            </div>
          </div>
        </div>

        {/* Recent Matches */}
        <div className="w-full mt-1 p-4 rounded-xl bg-slate-900/80 border border-slate-600 space-y-3">
          <h3 className="text-sm font-semibold flex items-center">
            <Trophy size={16} className="mr-2 text-amber-300" />
            Recent Online Matches
          </h3>
          {recentMatches.length === 0 ? (
            <p className="text-xs text-gray-400">
              No recent matches yet. Play some ranked games to see your history
              here.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {recentMatches.map((m) => {
                const isWinner = m.winnerWallet
                  ? m.winnerWallet.toLowerCase() === userWallet
                  : false;
                const opponentWallet = m.players.find(
                  (p) => p.toLowerCase() !== userWallet
                );
                let opponentName = "Unknown";
                if (userWallet === m.playerX && m.playerONickname) {
                  opponentName = m.playerONickname;
                } else if (userWallet === m.playerO && m.playerXNickname) {
                  opponentName = m.playerXNickname;
                } else if (opponentWallet) {
                  opponentName = `Player_${opponentWallet
                    .slice(2, 6)
                    .toUpperCase()}`;
                }

                const date = new Date(m.createdAt || Date.now());
                const dateStr = date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                });

                return (
                  <div
                    key={m.id}
                    className={`flex justify-between items-center p-2 rounded-lg text-xs ${
                      isWinner
                        ? "bg-emerald-500/15 border border-emerald-400/40"
                        : "bg-slate-800/80 border border-slate-600/80"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold truncate max-w-[140px]">
                        vs {opponentName}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {dateStr} ·{" "}
                        {m.winnerSymbol
                          ? isWinner
                            ? "You won"
                            : "You lost"
                          : "Draw"}
                      </span>
                    </div>
                    <div className="text-right text-[11px]">
                      <span
                        className={`px-2 py-1 rounded-full font-semibold ${
                          isWinner
                            ? "bg-emerald-400/20 text-emerald-200"
                            : m.winnerSymbol
                            ? "bg-red-400/20 text-red-200"
                            : "bg-yellow-400/20 text-yellow-100"
                        }`}
                      >
                        {m.winnerSymbol
                          ? isWinner
                            ? "WIN"
                            : "LOSS"
                          : "DRAW"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => setMode("selection")}
          className="mt-2 w-full bg-red-600 p-3 rounded-lg hover:bg-red-700"
        >
          Back to Menu
        </button>
      </div>
    );
  };

  const LeaderboardPage = () => {
    const list =
      leaderboardMode === "wins" ? leaderboardWins : leaderboardPoints;

    return (
      <div className="flex flex-col items-center w-full max-w-sm p-4 bg-gray-900/90 rounded-xl text-white space-y-4 border border-slate-700/70 shadow-inner">
        <div className="w-full flex flex-col items-center mb-1">
          <h2 className="text-2xl font-bold flex items-center">
            <BarChart className="mr-2 text-sky-400" /> Leaderboard
          </h2>
          <p className="text-xs text-gray-400 mt-1 text-center">
            View top players by online wins or XO points.
          </p>
        </div>

        <div className="w-full flex bg-slate-900/70 rounded-full p-1 border border-slate-600/80 text-xs">
          <button
            onClick={() => setLeaderboardMode("wins")}
            className={`flex-1 py-2 rounded-full font-semibold transition ${
              leaderboardMode === "wins"
                ? "bg-sky-500 text-black shadow"
                : "text-gray-300 hover:text-white"
            }`}
          >
            Online Wins
          </button>
          <button
            onClick={() => setLeaderboardMode("points")}
            className={`flex-1 py-2 rounded-full font-semibold transition ${
              leaderboardMode === "points"
                ? "bg-emerald-500 text-black shadow"
                : "text-gray-300 hover:text-white"
            }`}
          >
            XO Points
          </button>
        </div>

        {list.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="animate-spin mr-2" /> Loading Leaderboard...
          </div>
        ) : (
          <div className="w-full space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {list.map((user: any, index: number) => {
              const wins = user.onlineWins || 0;
              const losses = user.onlineLosses || 0;
              const draws = user.onlineDraws || 0;
              const totalOnline = wins + losses + draws;
              const winRate =
                totalOnline > 0
                  ? Math.round((wins / totalOnline) * 100)
                  : 0;

              const xoPoints =
                user.xoPoints !== undefined
                  ? user.xoPoints
                  : user.wallet || 0;

              const isSelf = user.id === userWallet;
              const rankName =
                leaderboardMode === "wins"
                  ? getRankLabel(wins)
                  : xoPoints >= 10000
                  ? "Whale"
                  : xoPoints >= 8000
                  ? "Grinder"
                  : xoPoints >= 6000
                  ? "Stacker"
                  : "Climber";

              const userBadges = getBadges(
                xoPoints,
                {
                  wins: user.wins || 0,
                  losses: user.losses || 0,
                  draws: user.draws || 0,
                  onlineWins: wins,
                  onlineLosses: losses,
                  onlineDraws: draws,
                  currentStreak: user.currentStreak || 0,
                  bestStreak: user.bestStreak || 0,
                } as Stats
              );
              const badge = userBadges[0];

              return (
                <div
                  key={user.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    isSelf
                      ? "border-yellow-400/70 bg-yellow-500/10"
                      : "border-slate-700 bg-slate-900/70"
                  } shadow-sm`}
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0
                        ? "bg-yellow-400 text-black"
                        : index === 1
                        ? "bg-gray-300 text-black"
                        : index === 2
                        ? "bg-amber-700 text-white"
                        : "bg-slate-800 text-slate-100"
                    }`}
                  >
                    {index + 1}
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold truncate max-w-[120px]">
                        {user.nickname || "Anon"}
                        {isSelf && (
                          <span className="ml-1 text-[10px] text-yellow-300">
                            (You)
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-sky-300">
                        {rankName}
                      </span>
                    </div>

                    {leaderboardMode === "wins" ? (
                      <>
                        <div className="flex justify-between items-center text-xs mt-1">
                          <span className="text-emerald-300 font-semibold">
                            {wins} online wins
                          </span>
                          <span className="text-gray-400">
                            {winRate}% win rate
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                            style={{
                              width: `${Math.min(winRate, 100)}%`,
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between items-center text-xs mt-1">
                          <span className="text-emerald-300 font-semibold">
                            {xoPoints} XO points
                          </span>
                          <span className="text-gray-400">
                            {wins} online wins
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-500"
                            style={{
                              width: `${
                                Math.min(xoPoints / 12000, 1) * 100
                              }%`,
                            }}
                          />
                        </div>
                      </>
                    )}

                    {badge && (
                      <div className="mt-1 text-[10px] text-slate-300 flex items-center gap-1">
                        <span>{badge.emoji}</span>
                        <span>{badge.label}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button
          onClick={() => setMode("selection")}
          className="mt-1 w-full bg-indigo-600 p-3 rounded-lg hover:bg-indigo-700 text-sm font-semibold"
        >
          Back
        </button>
      </div>
    );
  };

  const TournamentPage = () => (
    <div className="flex flex-col items-center w-full max-w-sm p-4 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-950 rounded-xl text-white space-y-5 border border-slate-700/70 shadow-2xl">
      <div className="flex flex-col items-center space-y-2">
        <div className="h-12 w-12 rounded-full bg-yellow-400/10 border border-yellow-400/60 flex items-center justify-center">
          <Trophy className="text-yellow-300" size={26} />
        </div>
        <h2 className="text-xl font-extrabold tracking-wide text-center">
          Tournament Arena
        </h2>
        <p className="text-xs text-gray-300 text-center max-w-xs">
          Compete with the best X &amp; O players on Base in special seasonal
          events.
        </p>
      </div>

      <div className="w-full rounded-2xl bg-gradient-to-br from-indigo-700 via-purple-700 to-slate-900 border border-indigo-400/60 shadow-inner p-5 space-y-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-indigo-200 mb-1">
          Featured Tournament
        </p>
        <h3 className="text-2xl font-black leading-snug">
          Are you a{" "}
          <span className="text-yellow-300">
            god
          </span>{" "}
          of X &amp; O?
        </h3>
        <p className="text-xs text-indigo-100/90">
          A high-stakes onchain showdown for the sharpest tic-tac-toe minds.
          Climb the bracket, flex your wallet, and claim eternal bragging
          rights.
        </p>

        <div className="flex flex-col items-center space-y-2 pt-2">
          <button
            disabled
            className="w-full py-3 rounded-full bg-slate-500/30 border border-slate-400/50 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 cursor-not-allowed flex items-center justify-center"
          >
            Register
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200">
              Locked
            </span>
          </button>
          <span className="text-[11px] font-medium text-yellow-200/90 tracking-[0.25em] uppercase">
            Coming Soon
          </span>
          <p className="text-[10px] text-indigo-100/70 text-center">
            Follow the X &amp; O Mini App on Base to be the first to know when
            registrations open.
          </p>
        </div>
      </div>

      <div className="text-[10px] text-gray-400 text-center max-w-xs">
        Tournament stats and rewards will hook into your wallet-based profile,
        XO points, and leaderboard rank.
      </div>
    </div>
  );

  const WagerPage = () => {
    const parsedStake = Number(stakeAmount) || 0;
    const potentialWinnings = parsedStake > 0 ? parsedStake * 2 : 0;

    return (
      <div className="flex flex-col items-center w-full max-w-sm p-4 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-950 rounded-xl text-white space-y-5 border border-slate-700/70 shadow-2xl">
        <div className="flex flex-col items-center space-y-2">
          <div className="h-12 w-12 rounded-full bg-emerald-400/10 border border-emerald-400/60 flex items-center justify-center">
            <Users className="text-emerald-300" size={26} />
          </div>
          <h2 className="text-xl font-extrabold tracking-wide text-center">
            1v1 Arena
          </h2>
          <p className="text-xs text-gray-300 text-center max-w-xs">
            Challenge a single opponent with either in-game XO points or real
            USDC (prototype) stakes.
          </p>
        </div>

        <div className="w-full flex bg-slate-900/70 rounded-full p-1 border border-slate-600/80">
          <button
            onClick={() => setWagerMode("points")}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition ${
              wagerMode === "points"
                ? "bg-emerald-500 text-black shadow"
                : "text-gray-300 hover:text-white"
            }`}
          >
            XO Points
          </button>
          <button
            onClick={() => setWagerMode("usdc")}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition ${
              wagerMode === "usdc"
                ? "bg-sky-500 text-black shadow"
                : "text-gray-300 hover:text-white"
            }`}
          >
            USDC (proto)
          </button>
        </div>

        {wagerMode === "points" ? (
          <>
            {/* XO points staking */}
            <div className="w-full rounded-2xl bg-slate-900/70 border border-slate-700/80 p-4 space-y-3">
              <div className="flex justify-between items-center text-xs text-gray-300 mb-1">
                <span>Choose stake (XO points)</span>
                <span className="text-emerald-300 font-semibold">
                  Balance: {userData.xoPoints} XO
                </span>
              </div>
              <div className="flex gap-2">
                {[200, 500, 700].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setStakeAmount(String(amt))}
                    className={`flex-1 py-2 rounded-full text-xs font-semibold border ${
                      Number(stakeAmount) === amt
                        ? "bg-emerald-500 text-black border-emerald-400"
                        : "bg-slate-950 text-slate-100 border-slate-700 hover:border-emerald-400"
                    }`}
                  >
                    {amt} XO
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1">
                <span>Winner receives:</span>
                <span className="text-emerald-300 font-semibold">
                  {potentialWinnings.toFixed(0)} XO
                </span>
              </div>
            </div>

            <div className="w-full rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900 border border-emerald-400/60 p-4 space-y-3 shadow-inner">
              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-100 mb-1">
                Host a points match
              </p>
              <p className="text-xs text-emerald-50/90 mb-1">
                You&apos;ll create an online XO match with the chosen stake.
                Sides (X/O) remain random; stake applies to both players.
              </p>
              <button
                onClick={() =>
                  createPointsGameWithStake(Number(stakeAmount) || 0)
                }
                className="w-full py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs uppercase tracking-[0.18em] flex items-center justify-center"
              >
                Create XO Points Match
              </button>
              {generatedWagerCode && (
                <div className="mt-2 p-2 rounded-lg bg-black/30 border border-emerald-300/40 text-xs flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-200 mb-1">
                    Match Code
                  </span>
                  <span className="font-mono text-lg font-bold tracking-[0.2em]">
                    {generatedWagerCode}
                  </span>
                  <span className="mt-1 text-[10px] text-emerald-100/80 text-center">
                    Your opponent can join via this code in either the 1v1
                    screen or the Online tab.
                  </span>
                </div>
              )}
            </div>

            <div className="w-full rounded-2xl bg-slate-900/80 border border-slate-700 p-4 space-y-3 shadow-inner">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-200 mb-1">
                Join a points match
              </p>
              <p className="text-xs text-slate-100/90 mb-1">
                Enter the room code shared by your opponent. The host&apos;s
                chosen XO stake will apply to both of you.
              </p>
              <input
                ref={pointsMatchCodeRef}
                type="text"
                placeholder="XOABCDE"
                maxLength={8}
                className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-sm tracking-[0.2em] text-white placeholder-gray-500 outline-none focus:border-emerald-400"
              />
              <button
                onClick={() =>
                  joinOnlineGame(pointsMatchCodeRef.current?.value || "")
                }
                className="w-full py-3 rounded-full bg-slate-200 hover:bg-white text-black font-semibold text-xs uppercase tracking-[0.18em] flex items-center justify-center"
              >
                Join XO Points Match
              </button>
            </div>

            <div className="text-[10px] text-gray-400 text-center max-w-xs">
              XO points move only when a points match ends. AI and regular
              ranked games do not adjust your XO balance.
            </div>
          </>
        ) : (
          <>
            {/* USDC prototype */}
            <div className="w-full rounded-2xl bg-slate-900/70 border border-slate-700/80 p-4 space-y-3">
              <div className="flex justify-between items-center text-xs text-gray-300 mb-1">
                <span>Stake amount (USDC)</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 p-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white placeholder-gray-500 outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={() => setStakeAmount("1")}
                  className="text-[11px] px-2 py-1 rounded-full bg-slate-800 text-gray-200 border border-slate-600 hover:border-sky-400"
                >
                  1 USDC
                </button>
              </div>

              <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1">
                <span>Winner takes:</span>
                <span className="text-sky-300 font-semibold">
                  {potentialWinnings.toFixed(2)} USDC
                </span>
              </div>
            </div>

            <div className="w-full rounded-2xl bg-gradient-to-br from-sky-700 via-sky-800 to-slate-900 border border-sky-400/60 p-4 space-y-3 shadow-inner">
              <p className="text-[11px] uppercase tracking-[0.2em] text-sky-100 mb-1">
                Host a USDC match
              </p>
              <p className="text-xs text-sky-50/90 mb-1">
                Prototype only: this UI does not send real USDC yet. Wire it to
                your escrow smart contract and test on Base Sepolia first.
              </p>
              <button
                onClick={handleCreateWagerLobby}
                className="w-full py-3 rounded-full bg-sky-500 hover:bg-sky-400 text-black font-semibold text-xs uppercase tracking-[0.18em] flex items-center justify-center"
              >
                Create USDC Match (Proto)
              </button>
              {generatedWagerCode && (
                <div className="mt-2 p-2 rounded-lg bg-black/30 border border-sky-300/40 text-xs flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-sky-200 mb-1">
                    Match Code
                  </span>
                  <span className="font-mono text-lg font-bold tracking-[0.2em]">
                    {generatedWagerCode}
                  </span>
                </div>
              )}
            </div>

            <div className="w-full rounded-2xl bg-slate-900/80 border border-slate-700 p-4 space-y-3 shadow-inner">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-200 mb-1">
                Join a USDC match
              </p>
              <p className="text-xs text-slate-100/90 mb-1">
                Enter the match code your opponent shared. Make sure you both
                agree on the same stake.
              </p>
              <input
                ref={usdcMatchCodeRef}
                type="text"
                placeholder="XOABCDE"
                maxLength={8}
                className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-sm tracking-[0.2em] text-white placeholder-gray-500 outline-none focus:border-sky-400"
              />
              <button
                onClick={handleJoinWagerLobby}
                className="w-full py-3 rounded-full bg-slate-200 hover:bg-white text-black font-semibold text-xs uppercase tracking-[0.18em] flex items-center justify-center"
              >
                Join USDC Match (Proto)
              </button>
            </div>

            <div className="text-[10px] text-gray-400 text-center max-w-xs">
              Before using real USDC, connect these buttons to a secure escrow /
              payout smart contract and test on Base Sepolia first.
            </div>
          </>
        )}
      </div>
    );
  };

  const MenuItem = ({
    Icon,
    label,
    onClick,
    active,
  }: {
    Icon: any;
    label: string;
    onClick: () => void;
    active: boolean;
  }) => (
    <button
      className={`flex flex-col items-center text-[10px] font-medium px-2 py-1 transition-colors ${
        active ? "text-sky-400" : "text-gray-300 hover:text-sky-300"
      }`}
      onClick={onClick}
    >
      <Icon size={20} />
      <span className="mt-0.5">{label}</span>
    </button>
  );

  const FooterMenu = () => (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[92%] max-w-md h-14 bg-black/80 backdrop-blur-xl border border-slate-700/80 rounded-2xl flex justify-around items-center shadow-[0_10px_30px_rgba(0,0,0,0.6)] z-20">
      <MenuItem
        Icon={Home}
        label="Home"
        onClick={() => setMode("selection")}
        active={mode === "selection"}
      />
      <MenuItem
        Icon={Users}
        label="1v1"
        onClick={() => setMode("wager")}
        active={mode === "wager"}
      />
      <MenuItem
        Icon={Trophy}
        label="Tournament"
        onClick={() => setMode("tournament")}
        active={mode === "tournament"}
      />
      <MenuItem
        Icon={BarChart}
        label="Ranks"
        onClick={() => setMode("leaderboard")}
        active={mode === "leaderboard"}
      />
      <MenuItem
        Icon={User}
        label="Profile"
        onClick={() => setMode("stats")}
        active={mode === "stats"}
      />
    </div>
  );

  // NEW: for XO points stake games, go back to XO lobby instead of Play Again
  const exitStakePointsGame = useCallback(() => {
    setShowModal(false);
    setGameState(initialGameState);
    setOnlineGameId(null);
    setLocalPlayerSymbol(null);
    setMode("wager");
    setMessage("Choose your XO stake to start a new 1v1 match.");
  }, []);

  const Modal = useMemo(() => {
    if (!showModal) return null;
    const playerSymbol = mode === "ai" ? "X" : localPlayerSymbol;
    const isPlayerWin =
      !!gameState.winner && playerSymbol && gameState.winner === playerSymbol;

    const isStakePointsGame =
      mode === "online" && gameState.stakeType === "points";

    return (
      <div className="fixed inset-0 bg-gray-900 bg-opacity-90 flex justify-center items-center z-50 p-4">
        <div className="bg-white text-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-md text-center transform transition-all scale-100 animate-fade-in relative overflow-hidden">
          {isPlayerWin && (
            <div className="pointer-events-none absolute inset-0 flex justify-center items-center text-5xl opacity-20">
              🎉
            </div>
          )}
          <h2 className="text-3xl font-bold mb-4 relative z-10">
            {gameState.winner
              ? `Player ${gameState.winner} Wins!`
              : "Game Draw"}
          </h2>
          <p className="mb-6 text-lg relative z-10">
            {gameState.winner
              ? isPlayerWin
                ? "You outplayed the board. Nice."
                : "Your opponent took this round."
              : "Well matched!"}
          </p>

          {/* Normal games: Play Again button */}
          {!isStakePointsGame && (
            <button
              onClick={() => handleRestart(mode as GameMode)}
              className="w-full bg-indigo-600 text-white p-3 rounded-lg font-semibold hover:bg-indigo-700 transition duration-150 flex items-center justify-center relative z-10"
            >
              <RotateCcw size={20} className="mr-2" />
              Play Again
            </button>
          )}

          {/* XO stake games: Back to XO Points Lobby */}
          {isStakePointsGame && (
            <button
              onClick={exitStakePointsGame}
              className="w-full bg-emerald-500 text-white p-3 rounded-lg font-semibold hover:bg-emerald-400 transition duration-150 flex items-center justify-center relative z-10"
            >
              <RotateCcw size={20} className="mr-2" />
              Back to XO Points Lobby
            </button>
          )}

          <button
            onClick={() => setMode("selection")}
            className="w-full mt-3 bg-gray-200 text-gray-800 p-3 rounded-lg font-semibold hover:bg-gray-300 transition duration-150 relative z-10"
          >
            Change Mode
          </button>
          {mode === "online" && onlineGameId && (
            <button
              onClick={leaveOnlineGame}
              className="w-full mt-3 text-red-500 hover:text-red-700 underline font-semibold transition duration-150 relative z-10"
            >
              Leave Online Game
            </button>
          )}
        </div>
      </div>
    );
  }, [
    showModal,
    gameState.winner,
    mode,
    onlineGameId,
    leaveOnlineGame,
    localPlayerSymbol,
    gameState.stakeType,
    exitStakePointsGame,
  ]);

  const RenderLeaveButton = () => {
    if (
      mode === "selection" ||
      mode === "stats" ||
      mode === "leaderboard" ||
      mode === "tournament" ||
      mode === "wager"
    )
      return null;
    return (
      <button
        onClick={
          mode === "online" ? leaveOnlineGame : () => setMode("selection")
        }
        className="absolute top-4 left-4 p-2 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 z-20"
        title={`Leave ${mode} mode`}
      >
        <XIcon size={20} />
      </button>
    );
  };

  const TopBar = () => {
    const wins = stats.onlineWins;
    const rankLabel = getRankLabel(wins);
    const titleColor = "text-slate-50";
    const subtitleColor = "text-slate-400";

    return (
      <div className="w-full max-w-lg flex items-center justify-between pt-1 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-lg font-black">
            ❌⭕
          </div>
          <div>
            <p
              className={`text-[11px] uppercase tracking-[0.2em] ${subtitleColor}`}
            >
              Base Mini Game
            </p>
            <h1 className={`text-lg font-bold ${titleColor}`}>
              X &amp; O Arena
            </h1>
          </div>
        </div>
        <div className="text-right text-xs">
          <p className={subtitleColor}>Rank</p>
          <p className="text-emerald-400 font-semibold flex items-center gap-1">
            <Trophy size={14} /> {rankLabel}
          </p>
        </div>
      </div>
    );
  };

  // Neutral dark backgrounds
  const rootBgClass =
    theme === "light"
      ? "bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-50"
      : "bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white";

  // Wallet gate
  if (!isConnected || !userWallet) {
    return (
      <div
        className={`min-h-screen ${rootBgClass} flex flex-col items-center justify-center p-4`}
      >
        <TopBar />
        <div className="mt-6">
          <BaseLogoGlow connected={false} />
        </div>
        <p className="mt-4 text-sm text-gray-400 text-center max-w-xs">
          Connect your{" "}
          <span className="font-semibold text-sky-400">Base wallet</span> to
          start playing. Your wins, XO points, and rank are stored by wallet
          address.
        </p>

        <div className="mt-6">
          <Wallet>
            <ConnectWallet className="px-6 py-3 rounded-full bg-sky-500 hover:bg-sky-400 text-black font-semibold shadow-lg flex items-center">
              <DollarSign size={18} className="mr-2" />
              Connect Base Wallet
            </ConnectWallet>
            <WalletDropdown>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
        </div>

        <PopupContainer />
        <div className="absolute bottom-2 right-4 text-xs text-gray-500">
          Created by anakincoco
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div
      className={`min-h-screen ${rootBgClass} flex flex-col items-center p-4 sm:p-6 pb-24 font-inter relative`}
    >
      <TopBar />
      {RenderLeaveButton()}
      <HeaderBar />

      <div className="w-full max-w-lg flex flex-col items-center flex-grow">
        {mode === "selection" && <RenderSelection />}
        {mode === "stats" && <RenderSettings />}
        {mode === "leaderboard" && <LeaderboardPage />}
        {mode === "tournament" && <TournamentPage />}
        {mode === "wager" && <WagerPage />}
        {(mode === "local" || mode === "ai" || mode === "online") && (
          <>
            <div className="mb-4 flex items-center justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-600">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-slate-100">
                  {message}
                </span>
              </div>
            </div>
            <RenderBoard />
            {isThinking && (
              <p className="text-yellow-400 mt-3 flex items-center justify-center text-sm">
                <Cpu className="mr-2" size={16} /> AI is thinking...
              </p>
            )}
            {(mode === "local" || mode === "ai") && !gameState.isGameOver && (
              <button
                onClick={() => handleRestart(mode as GameMode)}
                className="mt-4 p-3 bg-gray-700 text-white rounded-lg font-semibold hover:bg-gray-600 flex items-center"
              >
                <Repeat size={20} className="mr-2" /> Reset Game
              </button>
            )}
            {mode === "online" && (
              <div className="mt-4 p-3 bg-gray-800 text-white rounded-lg text-sm text-center border border-slate-700">
                <p>
                  Game ID:{" "}
                  <span className="font-mono font-bold">{onlineGameId}</span>
                </p>
                <p>
                  You are:{" "}
                  <span
                    className={`font-bold ${
                      localPlayerSymbol === "X"
                        ? "text-black"
                        : "text-sky-400"
                    }`}
                    style={{
                      fontFamily:
                        localPlayerSymbol === "X" || localPlayerSymbol === "O"
                          ? '"FF Oxmox", system-ui, -apple-system, "Segoe UI", sans-serif'
                          : undefined,
                    }}
                  >
                    {localPlayerSymbol ?? "TBD"}
                  </span>
                </p>
                {gameState.stakeType === "points" &&
                  gameState.stakeAmountPoints && (
                    <p className="mt-1 text-emerald-300 text-xs">
                      Stake: {gameState.stakeAmountPoints} XO points (winner
                      gains, loser loses)
                    </p>
                  )}
                {gameState.playerX && gameState.playerO && (
                  <p className="mt-1">
                    Players: {gameState.playerXNickname} (X) vs{" "}
                    {gameState.playerONickname} (O)
                  </p>
                )}
                {localPlayerSymbol === "X" &&
                  !gameState.winner &&
                  !gameState.board.every((c) => c !== null) && (
                    <button
                      onClick={() => handleRestart("online")}
                      className="mt-2 text-yellow-400 hover:text-yellow-500 underline text-sm"
                    >
                      Force Restart (Host)
                    </button>
                  )}
              </div>
            )}
          </>
        )}
      </div>
      <FooterMenu />
      {Modal}
      <PopupContainer />
      <div className="absolute bottom-1 right-4 text-xs text-gray-500">
        Created by anakincoco
      </div>
    </div>
  );
};

export default App;