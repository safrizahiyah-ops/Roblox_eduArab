import {
  Award,
  BookOpen,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Keyboard,
  MapPin,
  Play,
  Send,
  User,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { LearningDrawer } from './components/LearningDrawer';
import {
  CompetitiveQuizBanner,
  IncomingGreetingCard,
  LiveLeaderboard,
} from './components/LiveArenaOverlays';
import { VocabCardModal } from './components/VocabCardModal';
import type { ScoreRow } from './game/network';
import { playSuccessChime, speakArabic } from './game/speech';
import type {
  ChatBubbleMessage,
  CompetitiveMatchState,
  GreetingChallenge,
  InteractTarget,
  NetworkPlayer,
  PlayerZoneStatus,
  VocabItem,
  ZoneId,
} from './game/types';
import { GREETING_PAIRS, VOCAB_ITEMS, ZONE_INFO } from './game/vocabData';

const AVATAR_COLORS = [
  { hex: '#2563EB', label: 'Biru' },
  { hex: '#059669', label: 'Hijau' },
  { hex: '#D97706', label: 'Oranye' },
  { hex: '#DC2626', label: 'Merah' },
  { hex: '#7C3AED', label: 'Ungu' },
];

export default function App() {
  const [playerName, setPlayerName] = useState('Pemain 1');
  const [playerColor, setPlayerColor] = useState('#2563EB');
  const [currentZone, setCurrentZone] = useState<PlayerZoneStatus>('central');

  const [remotePlayers, setRemotePlayers] = useState<NetworkPlayer[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [localId, setLocalId] = useState<string>('');
  const [networkMode, setNetworkMode] = useState<'websocket' | 'local-tab' | 'offline'>('offline');
  const [simulatedPeersEnabled, setSimulatedPeersEnabled] = useState(true);

  const [scoredVocabIds, setScoredVocabIds] = useState<Set<string>>(() => new Set());
  const [soloQuizStreak, setSoloQuizStreak] = useState(0);

  const [matchState, setMatchState] = useState<CompetitiveMatchState>({
    status: 'lobby',
    question: null,
    myAnsweredId: null,
    myPointsEarned: null,
    lastResultBanner: null,
    winners: [],
  });
  const [incomingGreeting, setIncomingGreeting] = useState<GreetingChallenge | null>(null);
  const [greetingToast, setGreetingToast] = useState<{
    text: string;
    tone: 'success' | 'info' | 'warn';
  } | null>(null);

  const [selectedVocab, setSelectedVocab] = useState<VocabItem | null>(null);
  const [nearestTarget, setNearestTarget] = useState<InteractTarget | null>(null);
  const [drawerTab, setDrawerTab] = useState<'zones' | 'vocab' | 'quiz' | null>(null);
  const [quizZoneFilter, setQuizZoneFilter] = useState<ZoneId | 'all'>('all');

  const [leaderboardCollapsed, setLeaderboardCollapsed] = useState(false);
  const [showPlayersMenu, setShowPlayersMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showControlsHelp, setShowControlsHelp] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [activeBubbles, setActiveBubbles] = useState<Record<string, ChatBubbleMessage>>({});

  const controllerActionsRef = useRef<{
    sendChat: (text: string, subText?: string) => void;
    sendGreetingChallenge: (greetingId: string) => void;
    answerGreetingChallenge: (challengeId: string, replyText: string) => void;
    startCompetitiveMatch: () => void;
    submitCompetitiveAnswer: (questionId: string, optionId: string) => void;
    addObjectScore: (vocabId: string, points: number) => void;
    togglePointerLock: () => void;
  } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setActiveBubbles((prev) => {
        let changed = false;
        const next: Record<string, ChatBubbleMessage> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.timestamp < 5500) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setIncomingGreeting((prev) => (prev && now >= prev.expiresAt ? null : prev));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!greetingToast) return;
    const t = window.setTimeout(() => setGreetingToast(null), 4800);
    return () => window.clearTimeout(t);
  }, [greetingToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleObjectScored = useCallback((vocabId: string, points: number) => {
    setScoredVocabIds((prev) => {
      if (prev.has(vocabId)) return prev;
      const next = new Set(prev);
      next.add(vocabId);
      controllerActionsRef.current?.addObjectScore(vocabId, points);
      return next;
    });
  }, []);

  const handleInteractTarget = useCallback((target: InteractTarget) => {
    if (target.type === 'vocab') {
      setSelectedVocab(target.item);
    } else {
      setQuizZoneFilter(target.zone);
      setDrawerTab('quiz');
    }
  }, []);

  const handleChatReceived = useCallback((msg: ChatBubbleMessage) => {
    setActiveBubbles((prev) => ({
      ...prev,
      [msg.playerId]: msg,
    }));
  }, []);

  const handleScoresSync = useCallback((nextScores: ScoreRow[], myId: string) => {
    setScores(nextScores);
    setLocalId(myId);
  }, []);

  const handleGreetingChallenge = useCallback((challenge: GreetingChallenge) => {
    setIncomingGreeting(challenge);
  }, []);

  const handleGreetingToast = useCallback((text: string, tone: 'success' | 'info' | 'warn') => {
    if (tone === 'success') playSuccessChime();
    setGreetingToast({ text, tone });
  }, []);

  const handleSendGreeting = (greetingId: string) => {
    const def = GREETING_PAIRS.find((g) => g.id === greetingId);
    if (!def) return;
    controllerActionsRef.current?.sendGreetingChallenge(greetingId);
    speakArabic(def.promptArabic);
  };

  const handleReplyGreeting = (challengeId: string, replyText: string) => {
    controllerActionsRef.current?.answerGreetingChallenge(challengeId, replyText);
    setIncomingGreeting(null);
    speakArabic(replyText);
  };

  const handleSendChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    controllerActionsRef.current?.sendChat(trimmed);
    setChatInput('');
  };

  const handleControllerReady = useCallback(
    (actions: {
      sendChat: (text: string, subText?: string) => void;
      sendGreetingChallenge: (greetingId: string) => void;
      answerGreetingChallenge: (challengeId: string, replyText: string) => void;
      startCompetitiveMatch: () => void;
      submitCompetitiveAnswer: (questionId: string, optionId: string) => void;
      addObjectScore: (vocabId: string, points: number) => void;
      togglePointerLock: () => void;
    }) => {
      controllerActionsRef.current = actions;
    },
    []
  );

  const networkLabel = useMemo(() => {
    if (networkMode === 'websocket') return 'WebSocket Real-Time';
    if (networkMode === 'local-tab') return 'Multi-Tab Lokal';
    return 'Mode Mandiri';
  }, [networkMode]);

  const myScore = useMemo(() => {
    return scores.find((s) => s.id === localId)?.score ?? 0;
  }, [scores, localId]);

  const currentZoneInfo = ZONE_INFO[currentZone];
  const onlineCount = 1 + remotePlayers.length;

  const closeAllPopovers = () => {
    setShowPlayersMenu(false);
    setShowProfileMenu(false);
    setShowControlsHelp(false);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-sky-100">
      <GameCanvas
        playerName={playerName}
        playerColor={playerColor}
        discoveredIds={scoredVocabIds}
        activeBubbles={activeBubbles}
        simulatedPeersEnabled={simulatedPeersEnabled}
        onInteractTarget={handleInteractTarget}
        onNearestChange={setNearestTarget}
        onZoneChange={setCurrentZone}
        onNetworkStatus={setNetworkMode}
        onRemotePlayersChange={setRemotePlayers}
        onScoresSync={handleScoresSync}
        onChatReceived={handleChatReceived}
        onMatchUpdate={setMatchState}
        onGreetingChallenge={handleGreetingChallenge}
        onGreetingToast={handleGreetingToast}
        onControllerReady={handleControllerReady}
      />

      {/* TOP HUD BAR */}
      <header className="pointer-events-none fixed top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand + Current Zone + Players Button + Live Score */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 px-4 py-2 shadow-lg border border-slate-200">
          <span className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
            Madrastī 3D
          </span>

          <div className="h-5 w-px bg-slate-200" aria-hidden="true" />

          <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span className="font-bold text-slate-900">{currentZoneInfo.id}</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span dir="rtl" lang="ar" className="font-arabic text-sm font-bold text-blue-700">
              {currentZoneInfo.arabic}
            </span>
          </div>

          <div className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />

          <button
            type="button"
            onClick={() => {
              const next = !showPlayersMenu;
              closeAllPopovers();
              setShowPlayersMenu(next);
            }}
            className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition-colors whitespace-nowrap"
          >
            <Users className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span className="tabular-nums">{onlineCount} Pemain</span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="text-slate-600">{networkLabel}</span>
          </button>

          <span className="text-xs font-extrabold text-amber-700 tabular-nums whitespace-nowrap">
            Skormu: {myScore} Poin
          </span>
        </div>

        {/* Right: Primary Start Quiz Race CTA + Tools */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl bg-white/95 p-1.5 shadow-lg border border-slate-200">
          <button
            type="button"
            onClick={() => controllerActionsRef.current?.startCompetitiveMatch()}
            disabled={matchState.status === 'active'}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
              matchState.status === 'active'
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            <span>
              {matchState.status === 'active' ? 'Lomba Kuis Berjalan' : 'Mulai Lomba Kuis'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDrawerTab(drawerTab === 'zones' ? null : 'zones')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              drawerTab === 'zones'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Award className="h-4 w-4" />
            <span>Zona</span>
          </button>

          <button
            type="button"
            onClick={() => setDrawerTab(drawerTab === 'vocab' ? null : 'vocab')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              drawerTab === 'vocab'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span className="tabular-nums">
              Benda ({scoredVocabIds.size}/{VOCAB_ITEMS.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDrawerTab(drawerTab === 'quiz' ? null : 'quiz')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              drawerTab === 'quiz'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <HelpCircle className="h-4 w-4" />
            <span>Latihan</span>
          </button>

          <div className="h-5 w-px bg-slate-200" aria-hidden="true" />

          <button
            type="button"
            onClick={() => {
              const next = !showProfileMenu;
              closeAllPopovers();
              setShowProfileMenu(next);
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              showProfileMenu ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
            aria-label="Profil Avatar"
          >
            <User className="h-4 w-4" />
            <span className="hidden md:inline">{playerName}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !showControlsHelp;
              closeAllPopovers();
              setShowControlsHelp(next);
            }}
            className={`rounded-xl p-1.5 transition-colors ${
              showControlsHelp
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
            aria-label="Panduan Kontrol"
          >
            <Keyboard className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* LIVE LEADERBOARD (Top-Right below header, when drawer is closed) */}
      {!drawerTab && scores.length > 0 && (
        <div className="pointer-events-none fixed top-20 right-4 z-10 hidden md:block">
          <LiveLeaderboard
            scores={scores}
            localId={localId}
            collapsed={leaderboardCollapsed}
            onToggleCollapse={() => setLeaderboardCollapsed((v) => !v)}
          />
        </div>
      )}

      {/* LIVE COMPETITIVE QUIZ OVERLAY */}
      <CompetitiveQuizBanner
        match={matchState}
        localId={localId}
        onStartMatch={() => controllerActionsRef.current?.startCompetitiveMatch()}
        onAnswer={(qId, optId) => controllerActionsRef.current?.submitCompetitiveAnswer(qId, optId)}
        onDismissWinner={() =>
          setMatchState((prev) => ({
            ...prev,
            status: 'lobby',
            winners: [],
          }))
        }
      />

      {/* INCOMING GREETING CHALLENGE CARD (+40 Penjawab, +25 Penanya) */}
      <IncomingGreetingCard
        challenge={incomingGreeting}
        onReply={handleReplyGreeting}
        onDismiss={() => setIncomingGreeting(null)}
      />

      {/* GREETING REWARD TOAST */}
      {greetingToast && (
        <div
          className={`fixed top-20 left-4 z-30 max-w-sm rounded-xl px-4 py-2.5 text-xs font-bold shadow-lg border ${
            greetingToast.tone === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : greetingToast.tone === 'warn'
              ? 'bg-amber-50 text-amber-900 border-amber-300'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {greetingToast.text}
        </div>
      )}

      {/* Online Players List Popover */}
      {showPlayersMenu && (
        <div className="fixed top-20 left-4 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-4 shadow-2xl border border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Klasemen & Pemain ({onlineCount})
            </h3>
            <span className="text-[11px] font-semibold text-blue-700">{networkLabel}</span>
          </div>

          <ul className="mt-3 space-y-2 max-h-56 overflow-y-auto">
            {scores.map((row, idx) => (
              <li
                key={row.id}
                className={`flex items-center justify-between rounded-xl px-3 py-2 border ${
                  row.id === localId ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-slate-500 tabular-nums">#{idx + 1}</span>
                  <span
                    className="h-3 w-3 rounded-sm shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                  <span dir="auto" className="text-xs font-bold text-slate-900 truncate">
                    {row.name}
                    {row.id === localId ? ' (Kamu)' : ''}
                  </span>
                </div>
                <span className="text-xs font-extrabold text-amber-700 tabular-nums shrink-0">
                  {row.score} pts
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 border-t border-slate-200 pt-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-900">Simulasi Pelajar Lokal</p>
              <p className="text-[11px] text-slate-500">
                Bot Zaid & Aisyah ikut berlomba & menyapa untuk uji coba solo
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSimulatedPeersEnabled((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors shrink-0 ${
                simulatedPeersEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {simulatedPeersEnabled ? 'Aktif' : 'Nonaktif'}
            </button>
          </div>
        </div>
      )}

      {/* Avatar Profile Popover */}
      {showProfileMenu && (
        <div className="fixed top-20 right-4 z-30 w-72 rounded-2xl bg-white p-4 shadow-2xl border border-slate-200">
          <h3 className="font-display text-sm font-bold text-slate-900">Pengaturan Pemain</h3>
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            Nama Pemain (tampil di Klasemen)
            <input
              type="text"
              value={playerName}
              maxLength={20}
              onChange={(e) => setPlayerName(e.target.value || 'Pemain')}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </label>
          <div className="mt-3">
            <span className="block text-xs font-semibold text-slate-600">Warna Avatar</span>
            <div className="mt-1.5 flex items-center gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setPlayerColor(c.hex)}
                  aria-label={`Pilih warna ${c.label}`}
                  className={`h-7 w-7 rounded-lg border-2 transition-transform ${
                    playerColor === c.hex ? 'border-slate-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Controls Quick Guide */}
      {showControlsHelp && (
        <div className="fixed top-20 right-4 z-30 w-80 rounded-2xl bg-white p-4 shadow-2xl border border-slate-200">
          <h3 className="font-display text-sm font-bold text-slate-900">Cara Meraih Poin Tertinggi</h3>
          <ul className="mt-2.5 space-y-2 text-xs text-slate-600">
            <li className="flex justify-between gap-2">
              <span className="font-semibold text-slate-800">Kunjungi & Klik Objek 3D</span>
              <span className="font-bold text-amber-700">+50 Poin</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="font-semibold text-slate-800">Lomba Kuis Tercepat</span>
              <span className="font-bold text-amber-700">+60 s.d. +100</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="font-semibold text-slate-800">Jawab Sapaan Pemain Lain</span>
              <span className="font-bold text-emerald-700">+40 Poin</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="font-semibold text-slate-800">Penanya Sapaan (jika dijawab)</span>
              <span className="font-bold text-emerald-700">+25 Poin</span>
            </li>
          </ul>
          <div className="mt-3 border-t border-slate-200 pt-2.5 text-[11px] text-slate-500 space-y-1">
            <p>WASD / Panah: Gerak · Spasi: Lompat · Seret Mouse: Kamera</p>
            <p>E atau Klik Objek/Pos Kuis: Jawab Pertanyaan</p>
          </div>
          <button
            type="button"
            onClick={() => {
              controllerActionsRef.current?.togglePointerLock();
              setShowControlsHelp(false);
            }}
            className="mt-3 w-full rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Aktifkan Pointer Lock Kamera (Opsional)
          </button>
        </div>
      )}

      {/* Proximity Prompt */}
      {nearestTarget && !selectedVocab && (
        <div
          className={`fixed left-1/2 z-20 -translate-x-1/2 transition-all duration-200 ${
            dockCollapsed ? 'bottom-16' : 'bottom-36'
          }`}
        >
          <button
            type="button"
            onClick={() => handleInteractTarget(nearestTarget)}
            className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-white shadow-xl border border-slate-700 hover:bg-slate-800 transition-colors"
          >
            <span className="rounded-md bg-amber-400 px-2 py-0.5 text-xs font-extrabold text-slate-950">
              E
            </span>
            {nearestTarget.type === 'vocab' ? (
              <>
                <span className="text-xs font-semibold whitespace-nowrap">
                  {scoredVocabIds.has(nearestTarget.item.id)
                    ? `Lihat: ${nearestTarget.item.indonesian}`
                    : 'Jawab Pertanyaan Benda (+50 Poin)'}
                </span>
                <span aria-hidden="true" className="text-slate-500">
                  ·
                </span>
                <span dir="rtl" lang="ar" className="font-arabic text-lg font-bold text-amber-300">
                  {nearestTarget.item.arabic}
                </span>
              </>
            ) : (
              <>
                <span className="text-xs font-semibold whitespace-nowrap">
                  Buka {nearestTarget.title}
                </span>
                <span aria-hidden="true" className="text-slate-500">
                  ·
                </span>
                <span dir="rtl" lang="ar" className="font-arabic text-base font-bold text-sky-300">
                  {nearestTarget.arabicTitle}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* COLLAPSIBLE BOTTOM CONTROL DOCK (Sapaan Berpoin + Chat) */}
      <div
        className={`fixed bottom-4 left-1/2 z-20 w-[min(940px,94vw)] -translate-x-1/2 transition-transform duration-200 ${
          dockCollapsed ? 'translate-y-[calc(100%-30px)]' : 'translate-y-0'
        }`}
      >
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="flex items-center gap-1.5 rounded-t-xl bg-white/95 px-4 py-1 text-xs font-semibold text-slate-700 border border-b-0 border-slate-200 shadow-sm hover:text-slate-900"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Tampilkan Sapaan Berpoin</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Sembunyikan (H)</span>
              </>
            )}
          </button>
        </div>

        <div className="rounded-2xl bg-white/95 p-3 shadow-2xl border border-slate-200 space-y-2.5">
          {/* Reciprocal Greeting Buttons (Penanya +25, Penjawab +40) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="text-[11px] font-bold text-emerald-700 whitespace-nowrap shrink-0 mr-1">
              Sapa Pemain (+25/+40):
            </span>
            {GREETING_PAIRS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSendGreeting(p.id)}
                title={`${p.promptTranslit} (${p.promptMeaning}) — Klik untuk mengirim tantangan sapaan berpoin!`}
                className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-slate-900 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
              >
                <span dir="rtl" lang="ar" className="font-arabic text-base font-bold">
                  {p.promptArabic}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <form onSubmit={handleSendChatSubmit} className="flex flex-1 items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                dir="auto"
                placeholder="Ketik pesan bebas untuk chat di atas avatar..."
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Kirim</span>
              </button>
            </form>

            <p className="hidden lg:block text-[11px] font-medium text-slate-500 whitespace-nowrap shrink-0">
              WASD: Jalan · Spasi: Lompat · Seret Mouse: Kamera · E/Klik: Jawab Benda (+50)
            </p>
          </div>
        </div>
      </div>

      {/* Collapsible Learning Drawer (Progres Zona, Kamus, Latihan Mandiri) */}
      <LearningDrawer
        openTab={drawerTab}
        quizZoneFilter={quizZoneFilter}
        score={myScore}
        streak={soloQuizStreak}
        discoveredIds={scoredVocabIds}
        onClose={() => setDrawerTab(null)}
        onChangeTab={(tab) => setDrawerTab(tab)}
        onChangeQuizZone={(z) => setQuizZoneFilter(z)}
        onInspectItem={(item) => setSelectedVocab(item)}
        onQuizAnswer={(isCorrect) => {
          if (isCorrect) {
            setSoloQuizStreak((st) => st + 1);
            controllerActionsRef.current?.addObjectScore('', 30);
          } else {
            setSoloQuizStreak(0);
          }
        }}
      />

      {/* Interactive Object Vocab + Point Challenge Modal */}
      {selectedVocab && (
        <VocabCardModal
          item={selectedVocab}
          isScored={scoredVocabIds.has(selectedVocab.id)}
          onScored={handleObjectScored}
          onClose={() => setSelectedVocab(null)}
        />
      )}
    </div>
  );
}
