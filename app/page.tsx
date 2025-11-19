"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Repeat,
  Home,
  Users,
  Cpu,
  TrendingUp,
  RotateCcw,
  BarChart,
  X,
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
  [6, 7, 8],
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
  wallet: number;
  walletAddress: string | null;
};

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
};

type Stats = {
  wins: number;
  losses: number;
  draws: number;
  onlineWins: number;
  onlineLosses: number;
  onlineDraws: number;
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

// --- Initial Game State ---
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
};

// --- Initial Stats and User Data ---
const initialStats: Stats = {
  wins: 0,
  losses: 0,
  draws: 0,
  onlineWins: 0,
  onlineLosses: 0,
  onlineDraws: 0,
};

const initialUserData: PlayerData = {
  nickname: "Guest",
  wallet: 100,
  walletAddress: null,
};

// --- Animated X and O (updated styles) ---
const AnimatedX = () => (
  <div className="flex justify-center items-center w-full h-full text-5xl sm:text-6xl font-black text-black">
    <span
      className="animate-in fade-in zoom-in duration-500"
      style={{ fontFamily: '"Georgia", "Times New Roman", serif' }}
    >
      X
    </span>
  </div>
);

const AnimatedO = () => (
  <div className="flex justify-center items-center w-full h-full text-5xl sm:text-6xl font-black text-blue-500">
    <span
      className="animate-in fade-in zoom-in duration-500"
      style={{ fontFamily: '"Georgia", "Times New Roman", serif' }}
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

// --- Global Popup ---
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
  const [nicknameInput, setNicknameInput] = useState("");
  const [joinGameIdInput, setJoinGameIdInput] = useState("");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // 1v1 Wager UI state
  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [wagerMode, setWagerMode] = useState<"create" | "join">("create");
  const [wagerMatchCode, setWagerMatchCode] = useState("");
  const [generatedWagerCode, setGeneratedWagerCode] = useState<string | null>(
    null
  );

  const currentPlayerSymbol: Symbol = gameState.isXNext ? "X" : "O";
  const userWallet = address?.toLowerCase() ?? null;

  const isLocalTurn = useMemo(() => {
    return (
      mode === "local" ||
      (mode === "ai" && currentPlayerSymbol === "X") ||
      (mode === "online" && currentPlayerSymbol === localPlayerSymbol)
    );
  }, [mode, currentPlayerSymbol, localPlayerSymbol]);

  useEffect(() => {
    if (userData.nickname && !nicknameInput) {
      setNicknameInput(userData.nickname);
    }
  }, [userData.nickname, nicknameInput]);

  // Farcaster ready
  useEffect(() => {
    try {
      miniappSdk.actions.ready();
    } catch (e) {
      console.log("Farcaster miniapp ready() not available, ignoring.");
    }
  }, []);

  // Wallet-based user data
  useEffect(() => {
    if (!db || !userWallet) return;

    const userDocRef = doc(db, "users", userWallet);

    const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setUserData((prev) => ({
          ...prev,
          walletAddress: userWallet,
          nickname:
            data.nickname || `Player_${userWallet.slice(2, 6).toUpperCase()}`,
          wallet: data.wallet !== undefined ? data.wallet : 100,
        }));
        setStats({
          wins: data.wins || 0,
          losses: data.losses || 0,
          draws: data.draws || 0,
          onlineWins: data.onlineWins || 0,
          onlineLosses: data.onlineLosses || 0,
          onlineDraws: data.onlineDraws || 0,
        });
      } else {
        const newUserData = {
          nickname: `Player_${userWallet.slice(2, 6).toUpperCase()}`,
          wallet: 100,
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

  const updateNickname = async () => {
    if (!userWallet || !db || !nicknameInput.trim()) return;
    try {
      await setDoc(
        doc(db, "users", userWallet),
        { nickname: nicknameInput.trim(), lastUpdated: Date.now() },
        { merge: true }
      );
      showPopup("Nickname updated!", "info");
    } catch (e) {
      showPopup("Failed to update nickname.", "error");
    }
  };

  // --- Online Game Functions (wallet-based, RANDOM X/O) ---
  const createOnlineGame = async () => {
    if (!userWallet || !db) {
      showPopup("Connect your Base wallet first.", "error");
      return;
    }
    try {
      const gameId = Math.random().toString(36).substring(2, 10).toUpperCase();
      const gameDocRef = doc(db, "games", gameId);

      const initial: GameState & {
        hostWallet: string | null;
        hostNickname: string | null;
      } = {
        ...initialGameState,
        gameMode: "online",
        playerX: null,
        playerO: null,
        lastUpdated: Date.now(),
        playerXNickname: null,
        playerONickname: null,
        hostWallet: userWallet,
        hostNickname: userData.nickname,
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

  const joinOnlineGame = async (gameIdInput: string) => {
    if (!userWallet || !db || !gameIdInput) {
      showPopup("Connect your Base wallet and enter a game ID.", "error");
      return;
    }

    const cleanId = gameIdInput.trim().toUpperCase();
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

  // --- Online Listener ---
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

  // AI move
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
  ]);

  // Stats update
  const updateStats = useCallback(
    async (result: "win" | "loss" | "draw", isOnline: boolean) => {
      if (!userWallet || !db) return;
      const userDocRef = doc(db, "users", userWallet);

      await runTransaction(db, async (transaction: any) => {
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists()) return;

        const data = userDoc.data() as any;
        const update: any = { lastGame: Date.now() };

        if (result === "win") {
          update.wins = (data.wins || 0) + 1;
          update.wallet = (data.wallet || 0) + (isOnline ? 5 : 1);
        } else if (result === "loss") {
          update.losses = (data.losses || 0) + 1;
          update.wallet = Math.max(0, (data.wallet || 0) - (isOnline ? 3 : 0));
        } else {
          update.draws = (data.draws || 0) + 1;
        }

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
        } else {
          status = "It's a Draw! 🤝";
          updateStats("draw", mode === "online");
        }
      } else {
        status = `Player ${newIsXNext ? "X" : "O"}'s Turn`;
      }

      return { ...resultState, message: status };
    },
    [mode, localPlayerSymbol, updateStats]
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

  const handleClick = (index: number) => {
    if (!isLocalTurn || isThinking) return;
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

  // Leaderboard fetch
  useEffect(() => {
    if (mode === "leaderboard" && db) {
      const fetchLeaderboard = async () => {
        try {
          const usersRef = collection(db, "users");
          const q = query(usersRef, orderBy("onlineWins", "desc"), limit(50));
          const querySnapshot = await getDocs(q);
          const topUsers = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setLeaderboard(topUsers);
        } catch (e) {
          console.error("Error fetching leaderboard:", e);
          showPopup("Failed to load leaderboard.", "error");
        }
      };
      fetchLeaderboard();
    }
  }, [mode, showPopup]);

  // 1v1 wager handlers (UI only)
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
      `Prototype only: created 1v1 code ${code}. Wire this to your USDC escrow contract before using with real funds.`,
      "info"
    );
  };

  const handleJoinWagerLobby = () => {
    if (!wagerMatchCode.trim()) {
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
      `Prototype only: would join 1v1 match ${wagerMatchCode}. Connect this to your escrow contract logic.`,
      "info"
    );
  };

  // Board + UI blocks
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
          ? "bg-yellow-400/80 text-gray-900 animate-pulse"
          : "bg-white hover:bg-gray-100"
      } ${value === "X" ? "text-black" : "text-blue-500"}`}
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
    return (
      <div className="w-full max-w-md flex justify-between items-center p-3 bg-slate-900/80 rounded-2xl shadow-lg mb-4 text-white border border-slate-700">
        <BaseLogoGlow connected={!!userWallet} />
        <div className="flex flex-col items-end space-y-1">
          <div className="flex items-center space-x-2">
            <User size={18} className="text-indigo-400" />
            <span className="text-sm font-semibold truncate max-w-[120px]">
              {userData.nickname}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <DollarSign size={16} className="text-green-400" />
              <span className="text-sm font-semibold">{userData.wallet}</span>
            </div>
            <span className="text-[11px] text-gray-300">
              {totalGames} total games
            </span>
          </div>
        </div>
      </div>
    );
  };

  // --- Hero animated X&O card ---
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
              <Cpu size={22} className="text-sky-300 animate-pulse" />
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
                    <span className="text-xl font-black text-red-400 animate-bounce">
                      X
                    </span>
                  )}
                  {isOSpot && (
                    <span className="text-xl font-black text-blue-400 animate-pulse">
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
    <div className="w-full flex flex-col items-center bg-gradient-to-br from-emerald-700 to-emerald-800 p-4 rounded-xl shadow-lg text-white space-y-3 border border-emerald-500/40 mt-1">
      <TrendingUp className="mb-1" />
      <h3 className="text-xl font-semibold">Online Multiplayer</h3>
      {!isConnected || !userWallet ? (
        <p className="text-yellow-300 text-sm text-center">
          Connect your Base wallet to play online ranked games.
        </p>
      ) : onlineGameId ? (
        <div className="w-full text-center">
          <p className="text-sm font-bold mb-1">
            In Game:{" "}
            <span className="font-mono bg-black/30 px-2 py-1 rounded">
              {onlineGameId}
            </span>
          </p>
          <p className="text-xs text-emerald-100 mb-2">
            Your side:{" "}
            <span className="font-semibold">
              {localPlayerSymbol ?? "TBD (random)"}
            </span>
          </p>
          <button
            onClick={() => setMode("online")}
            className="w-full p-3 bg-emerald-500 rounded-lg hover:bg-emerald-400 font-semibold"
          >
            Go To Game
          </button>
          <button
            onClick={leaveOnlineGame}
            className="mt-2 text-red-200 hover:text-red-300 underline text-xs"
          >
            Leave Game
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={createOnlineGame}
            className="w-full p-3 bg-emerald-900 rounded-lg hover:bg-emerald-700 font-semibold"
          >
            Create Ranked Game (Random X/O)
          </button>
          <input
            type="text"
            placeholder="Enter Game ID"
            value={joinGameIdInput}
            onChange={(e) => setJoinGameIdInput(e.target.value.toUpperCase())}
            className="w-full p-2 rounded text-gray-900 placeholder-gray-500 text-center font-mono uppercase"
            maxLength={8}
          />
          <button
            onClick={() => joinOnlineGame(joinGameIdInput)}
            disabled={joinGameIdInput.length < 4}
            className={`w-full p-3 rounded-lg font-semibold transition ${
              joinGameIdInput.length < 4
                ? "bg-emerald-500/50 cursor-not-allowed"
                : "bg-emerald-500 hover:bg-emerald-400"
            }`}
          >
            Join Ranked Game
          </button>
        </>
      )}
    </div>
  );

  // Only Quick AI + Online section on home
  const RenderSelection = () => (
    <div className="flex flex-col items-center w-full max-w-sm space-y-4">
      <HeroAnimatedXO />

      <div className="w-full rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-900/40 border border-purple-500/40 p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-black/40 flex items-center justify-center">
            <Cpu size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">
              Quick Match vs AI
            </h3>
            <p className="text-[11px] text-slate-200/80">
              Instant game against a smart bot. Great for warming up your
              strategy.
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
            className="py-2 px-4 rounded-full font-semibold text-[11px] bg-purple-900/80 hover:bg-purple-800"
          >
            Medium
          </button>
          <button
            onClick={() => {
              setAiDifficulty("hard");
              setMode("ai");
              handleRestart("ai");
            }}
            className="py-2 px-4 rounded-full font-semibold text-[11px] bg-purple-500/80 hover:bg-purple-400 text-black"
          >
            Hard
          </button>
        </div>
      </div>

      <RenderOnlineSetup />
    </div>
  );

  // Profile
  const RenderSettings = () => {
    const totalGames = stats.wins + stats.losses + stats.draws;
    const totalOnlineGames =
      stats.onlineWins + stats.onlineLosses + stats.onlineDraws;
    const onlineWinRate =
      totalOnlineGames > 0
        ? Math.round((stats.onlineWins / totalOnlineGames) * 100)
        : 0;

    return (
      <div className="flex flex-col items-center w-full max-w-sm p-4 bg-gray-900/90 rounded-xl text-white space-y-4 border border-slate-700/80">
        <h2 className="text-2xl font-bold">Profile</h2>

        <div className="w-full">
          <label htmlFor="nickname" className="text-sm block mb-1">
            Nickname:
          </label>
          <div className="flex space-x-2">
            <input
              id="nickname"
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              className="flex-grow p-2 rounded text-gray-900"
              maxLength={15}
            />
            <button
              onClick={updateNickname}
              disabled={!nicknameInput.trim()}
              className={`p-2 rounded font-semibold transition ${
                !nicknameInput.trim()
                  ? "bg-indigo-400/50"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              Save
            </button>
          </div>
        </div>

        <div className="w-full p-3 bg-gray-800 rounded-lg flex justify-between items-center">
          <span className="font-semibold">Wallet balance:</span>
          <span className="flex items-center">
            <DollarSign size={16} className="text-green-400 mr-1" />
            {userData.wallet}
          </span>
        </div>

        {userWallet && (
          <div className="w-full p-3 bg-gray-800 rounded-lg text-xs break-all text-gray-300">
            Wallet address: {userWallet}
          </div>
        )}

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
              <span className="text-xs text-gray-400">Draws</span>
              <span className="text-lg font-bold text-yellow-300">
                {stats.draws}
              </span>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 flex flex-col">
              <span className="text-xs text-gray-400">Losses</span>
              <span className="text-lg font-bold text-red-400">
                {stats.losses}
              </span>
            </div>
          </div>
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

  // Leaderboard
  const LeaderboardPage = () => (
    <div className="flex flex-col items-center w-full max-w-sm p-4 bg-gray-900/90 rounded-xl text-white space-y-4 border border-slate-700/70 shadow-inner">
      <div className="w-full flex flex-col items-center mb-1">
        <h2 className="text-2xl font-bold flex items-center">
          <BarChart className="mr-2 text-sky-400" /> Online Leaderboard
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Top 50 ranked by online wins
        </p>
      </div>

      {leaderboard.length === 0 ? (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="animate-spin mr-2" /> Loading Leaderboard...
        </div>
      ) : (
        <div className="w-full space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {leaderboard.map((user: any, index: number) => {
            const wins = user.onlineWins || 0;
            const onlineLosses = user.onlineLosses || 0;
            const onlineDraws = user.onlineDraws || 0;
            const totalOnline = wins + onlineLosses + onlineDraws;
            const winRate =
              totalOnline > 0 ? Math.round((wins / totalOnline) * 100) : 0;

            const isSelf = user.id === userWallet;

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
                    <span className="text-xs text-gray-300">
                      {totalOnline} games
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-emerald-300 font-semibold">
                      {wins} online wins
                    </span>
                    <span className="text-gray-400">{winRate}% win rate</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                      style={{ width: `${Math.min(winRate, 100)}%` }}
                    />
                  </div>
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

  // Tournament
  const TournamentPage = () => (
    <div className="flex flex-col items-center w-full max-w-sm p-4 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-950 rounded-xl text-white space-y-5 border border-slate-700/70 shadow-2xl">
      <div className="flex flex-col items-center space-y-2">
        <div className="h-12 w-12 rounded-full bg-yellow-400/10 border border-yellow-400/60 flex items-center justify-center shadow-glow">
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
          <span className="text-yellow-300 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]">
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
        Tournament stats and rewards will hook into your existing wallet-based
        profile and leaderboard rank.
      </div>
    </div>
  );

  // 1v1 wager
  const WagerPage = () => {
    const parsedStake = Number(stakeAmount) || 0;
    const potentialWinnings = parsedStake > 0 ? parsedStake * 2 : 0;

    return (
      <div className="flex flex-col items-center w-full max-w-sm p-4 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-950 rounded-xl text-white space-y-5 border border-slate-700/70 shadow-2xl">
        <div className="flex flex-col items-center space-y-2">
          <div className="h-12 w-12 rounded-full bg-emerald-400/10 border border-emerald-400/60 flex items-center justify-center shadow-glow">
            <Users className="text-emerald-300" size={26} />
          </div>
          <h2 className="text-xl font-extrabold tracking-wide text-center">
            1v1 Wager Arena
          </h2>
          <p className="text-xs text-gray-300 text-center max-w-xs">
            Challenge a single opponent, set a Base USDC stake, and let X &amp;
            O decide who walks away with the pot.
          </p>
        </div>

        <div className="w-full flex bg-slate-900/70 rounded-full p-1 border border-slate-600/80">
          <button
            onClick={() => setWagerMode("create")}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition ${
              wagerMode === "create"
                ? "bg-emerald-500 text-black shadow"
                : "text-gray-300 hover:text-white"
            }`}
          >
            Host 1v1
          </button>
          <button
            onClick={() => setWagerMode("join")}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition ${
              wagerMode === "join"
                ? "bg-emerald-500 text-black shadow"
                : "text-gray-300 hover:text-white"
            }`}
          >
            Join 1v1
          </button>
        </div>

        <div className="w-full rounded-2xl bg-slate-900/70 border border-slate-700/80 p-4 space-y-3">
          <div className="flex justify-between items-center text-xs text-gray-300 mb-1">
            <span>Stake amount</span>
            <span className="flex items-center gap-1 text-emerald-300 font-semibold">
              <DollarSign size={12} />
              USDC on Base
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 p-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={() => setStakeAmount("1")}
              className="text-[11px] px-2 py-1 rounded-full bg-slate-800 text-gray-200 border border-slate-600 hover:border-emerald-400"
            >
              1 USDC
            </button>
          </div>

          <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1">
            <span>Winner takes:</span>
            <span className="text-emerald-300 font-semibold">
              {potentialWinnings.toFixed(2)} USDC
            </span>
          </div>
        </div>

        {wagerMode === "create" ? (
          <div className="w-full rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900 border border-emerald-400/60 p-4 space-y-3 shadow-inner">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-100 mb-1">
              Create a stake match
            </p>
            <p className="text-xs text-emerald-50/90 mb-1">
              You&apos;ll host the lobby. Share the match code with your
              opponent so they can lock in the same stake.
            </p>
            <button
              onClick={handleCreateWagerLobby}
              className="w-full py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs uppercase tracking-[0.18em] flex items-center justify-center"
            >
              Create 1v1 Lobby
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
                  Share this with your opponent and start your game in the{" "}
                  <span className="font-semibold">Online</span> tab.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-600 p-4 space-y-3 shadow-inner">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-200 mb-1">
              Join a stake match
            </p>
            <p className="text-xs text-slate-100/90 mb-1">
              Enter the match code your opponent shared. Make sure you both
              agree on the same stake amount.
            </p>
            <input
              type="text"
              value={wagerMatchCode}
              onChange={(e) => setWagerMatchCode(e.target.value.toUpperCase())}
              placeholder="XOABCDE"
              maxLength={8}
              className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-sm tracking-[0.2em] text-white placeholder-gray-500 outline-none focus:border-emerald-400"
            />
            <button
              onClick={handleJoinWagerLobby}
              className="w-full py-3 rounded-full bg-slate-200 hover:bg-white text-black font-semibold text-xs uppercase tracking-[0.18em] flex items-center justify-center"
            >
              Join 1v1 Lobby
            </button>
          </div>
        )}

        <div className="text-[10px] text-gray-400 text-center max-w-xs">
          <span className="font-semibold text-emerald-300">
            Onchain safety note:
          </span>{" "}
          This screen is UI-only right now. Before using real USDC, connect
          these buttons to a secure escrow / payout smart contract and test on
          Base Sepolia first.
        </div>
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
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[92%] max-w-md h-14 bg-black/70 backdrop-blur-xl border border-slate-700/80 rounded-2xl flex justify-around items-center shadow-[0_10px_30px_rgba(0,0,0,0.6)] z-20">
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

  const Modal = useMemo(() => {
    if (!showModal) return null;
    return (
      <div className="fixed inset-0 bg-gray-900 bg-opacity-90 flex justify-center items-center z-50 p-4">
        <div className="bg-white text-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-md text-center transform transition-all scale-100 animate-fade-in">
          <h2 className="text-3xl font-bold mb-4">
            {gameState.winner
              ? `Player ${gameState.winner} Wins!`
              : "Game Draw"}
          </h2>
          <p className="mb-6 text-lg">
            {gameState.winner ? "Victory!" : "Well matched!"}
          </p>
          <button
            onClick={() => handleRestart(mode as GameMode)}
            className="w-full bg-indigo-600 text-white p-3 rounded-lg font-semibold hover:bg-indigo-700 transition duration-150 flex items-center justify-center"
          >
            <RotateCcw size={20} className="mr-2" />
            Play Again
          </button>
          <button
            onClick={() => setMode("selection")}
            className="w-full mt-3 bg-gray-200 text-gray-800 p-3 rounded-lg font-semibold hover:bg-gray-300 transition duration-150"
          >
            Change Mode
          </button>
          {mode === "online" && onlineGameId && (
            <button
              onClick={leaveOnlineGame}
              className="w-full mt-3 text-red-500 hover:text-red-700 underline font-semibold transition duration-150"
            >
              Leave Online Game
            </button>
          )}
        </div>
      </div>
    );
  }, [showModal, gameState.winner, mode, onlineGameId, leaveOnlineGame]);

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
        <X size={20} />
      </button>
    );
  };

  const TopBar = () => {
    const wins = stats.onlineWins;
    const rankLabel =
      wins >= 20
        ? "Grandmaster"
        : wins >= 10
        ? "Master"
        : wins >= 5
        ? "Challenger"
        : wins >= 1
        ? "Rookie"
        : "Unranked";

    return (
      <div className="w-full max-w-lg flex items-center justify-between pt-1 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-lg font-black">
            ❌⭕
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Base Mini Game
            </p>
            <h1 className="text-lg font-bold text-white">X &amp; O Arena</h1>
          </div>
        </div>
        <div className="text-right text-xs">
          <p className="text-slate-400">Rank</p>
          <p className="text-emerald-400 font-semibold flex items-center gap-1">
            <Trophy size={14} /> {rankLabel}
          </p>
        </div>
      </div>
    );
  };

  // Wallet gate
  if (!isConnected || !userWallet) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col items-center justify-center p-4">
        <TopBar />
        <div className="mt-6">
          <BaseLogoGlow connected={false} />
        </div>
        <p className="mt-4 text-sm text-gray-300 text-center max-w-xs">
          Connect your{" "}
          <span className="font-semibold text-sky-300">Base wallet</span> to
          start playing. Your wins and rewards are stored by wallet address.
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
        <div className="absolute bottom-2 right-4 text-xs text-gray-400">
          Created by anakincoco
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col items-center p-4 sm:p-6 pb-24 font-inter relative">
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
                <Cpu className="mr-2 animate-pulse" size={16} /> AI is
                thinking...
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
                        : "text-blue-500"
                    }`}
                  >
                    {localPlayerSymbol ?? "TBD"}
                  </span>
                </p>
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