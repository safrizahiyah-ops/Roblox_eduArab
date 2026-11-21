import type {
  AnimState,
  ChatBubbleMessage,
  CompetitiveMatchState,
  CompetitiveQuestion,
  GreetingChallenge,
  NetworkPlayer,
  PlayerZoneStatus,
} from './types';
import { getZoneAtPosition, GREETING_PAIRS, VOCAB_ITEMS } from './vocabData';

export interface ScoreRow {
  id: string;
  name: string;
  color: string;
  score: number;
  zone: PlayerZoneStatus;
  isSimulatedBot?: boolean;
}

export interface NetworkCallbacks {
  onStatusChange: (mode: 'websocket' | 'local-tab' | 'offline') => void;
  onPlayersSync: (players: NetworkPlayer[]) => void;
  onScoresSync: (scores: ScoreRow[], localId: string) => void;
  onChatMessage: (msg: ChatBubbleMessage) => void;
  onMatchUpdate: (match: CompetitiveMatchState) => void;
  onGreetingChallenge: (challenge: GreetingChallenge) => void;
  onGreetingToast: (text: string, tone: 'success' | 'info' | 'warn') => void;
}

interface BotState {
  id: string;
  name: string;
  color: string;
  waypoints: [number, number][];
  waypointIdx: number;
  x: number;
  z: number;
  speed: number;
  score: number;
}

export class MultiplayerClient {
  public readonly localId: string;
  private localPlayer: NetworkPlayer;
  private remotePlayers = new Map<string, NetworkPlayer>();
  private ws: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;
  private callbacks: NetworkCallbacks;
  private reconnectTimer: number | null = null;
  private lastSendAt = 0;
  private disposed = false;
  private mode: 'websocket' | 'local-tab' | 'offline' = 'offline';

  private matchState: CompetitiveMatchState = {
    status: 'lobby',
    question: null,
    myAnsweredId: null,
    myPointsEarned: null,
    lastResultBanner: null,
    winners: [],
  };

  private localMatchTimer: number | null = null;
  private simulatedPeersEnabled = true;
  private botMoveTimer: number | null = null;
  private botGreetTimer: number | null = null;
  private bots: BotState[] = [
    {
      id: 'sim_zaid',
      name: 'زَيْدٌ (Zaid)',
      color: '#10B981',
      waypoints: [
        [4, 5],
        [14, 0],
        [20, -4],
        [14, 3],
        [3, -8],
        [-3, -15],
        [0, -9],
      ],
      waypointIdx: 1,
      x: 4,
      z: 5,
      speed: 3.1,
      score: 60,
    },
    {
      id: 'sim_aisyah',
      name: 'عَائِشَةُ (Aisyah)',
      color: '#D97706',
      waypoints: [
        [-4, 4],
        [-14, 0],
        [-20, 4],
        [-18, -4],
        [-5, -4],
        [3, -17],
        [-3, -2],
      ],
      waypointIdx: 1,
      x: -4,
      z: 4,
      speed: 2.8,
      score: 40,
    },
  ];

  // Track active local-fallback greeting challenges when offline
  private localGreetings = new Map<string, GreetingChallenge>();

  constructor(initialName: string, initialColor: string, callbacks: NetworkCallbacks) {
    this.localId = `p_${Math.random().toString(36).slice(2, 9)}`;
    this.localPlayer = {
      id: this.localId,
      name: initialName,
      color: initialColor,
      x: 0,
      y: 0,
      z: 6,
      rotY: Math.PI,
      animState: 'idle',
      zone: 'central',
      score: 0,
    };
    this.callbacks = callbacks;

    this.setupBroadcastChannel();
    this.connectWebSocket();
    this.setSimulatedPeersEnabled(true);
  }

  private setupBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.bc = new BroadcastChannel('lingoblox_arab_arena_v3');
      this.bc.onmessage = (event) => {
        const data = event.data;
        if (!data || data.senderId === this.localId) return;
        if (this.mode === 'websocket') return;

        if (data.type === 'join' || data.type === 'move') {
          this.upsertRemotePlayer(data.player);
          this.emitCombinedScores();
          if (data.type === 'join') {
            this.bc?.postMessage({
              type: 'move',
              senderId: this.localId,
              player: this.localPlayer,
            });
          }
        } else if (data.type === 'leave') {
          this.removeRemotePlayer(data.senderId);
          this.emitCombinedScores();
        } else if (data.type === 'chat') {
          this.callbacks.onChatMessage(data.message);
        } else if (data.type === 'greeting:challenge') {
          this.localGreetings.set(data.challenge.id, data.challenge);
          this.callbacks.onGreetingChallenge(data.challenge);
        } else if (data.type === 'greeting:resolved') {
          if (data.senderId === this.localId) {
            this.localPlayer.score += data.senderBonus;
            this.callbacks.onGreetingToast(
              `${data.answererName} menjawab sapaanmu dengan benar! (+${data.senderBonus} poin untukmu!)`,
              'success'
            );
            this.emitCombinedScores();
          }
        }
      };

      this.bc.postMessage({
        type: 'join',
        senderId: this.localId,
        player: this.localPlayer,
      });
    } catch {
      // BroadcastChannel unavailable
    }
  }

  private connectWebSocket() {
    if (this.disposed) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.disposed) {
          ws.close();
          return;
        }
        this.mode = 'websocket';
        this.callbacks.onStatusChange('websocket');
        ws.send(JSON.stringify({ type: 'join', ...this.localPlayer }));
      };

      ws.onmessage = (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'init') {
          const botsBackup = new Map<string, NetworkPlayer>();
          for (const [k, v] of this.remotePlayers.entries()) {
            if (v.isSimulatedBot) botsBackup.set(k, v);
          }
          this.remotePlayers.clear();
          for (const [k, v] of botsBackup.entries()) {
            this.remotePlayers.set(k, v);
          }
          if (Array.isArray(msg.players)) {
            for (const p of msg.players as NetworkPlayer[]) {
              if (p.id !== this.localId) {
                this.remotePlayers.set(p.id, p);
              }
            }
          }
          if (msg.match) {
            this.matchState = {
              status: msg.match.status,
              question: msg.match.question,
              myAnsweredId: null,
              myPointsEarned: null,
              lastResultBanner: null,
              winners: [],
            };
            this.callbacks.onMatchUpdate({ ...this.matchState });
          }
          this.emitPlayers();
          this.emitCombinedScores();
        } else if ((msg.type === 'player:joined' || msg.type === 'player:updated') && msg.player) {
          if (msg.player.id !== this.localId) {
            this.upsertRemotePlayer(msg.player);
          }
        } else if (msg.type === 'player:left' && msg.playerId) {
          this.removeRemotePlayer(msg.playerId);
          this.emitCombinedScores();
        } else if (msg.type === 'scores:sync' && Array.isArray(msg.scores)) {
          for (const row of msg.scores as ScoreRow[]) {
            if (row.id === this.localId) {
              this.localPlayer.score = row.score;
            } else {
              const existing = this.remotePlayers.get(row.id);
              if (existing) existing.score = row.score;
            }
          }
          this.emitCombinedScores(msg.scores as ScoreRow[]);
        } else if (msg.type === 'match:state') {
          const prevQId = this.matchState.question?.questionId;
          const isNewQ = msg.question && msg.question.questionId !== prevQId;
          this.matchState = {
            status: msg.status,
            question: msg.question,
            myAnsweredId: isNewQ ? null : this.matchState.myAnsweredId,
            myPointsEarned: isNewQ ? null : this.matchState.myPointsEarned,
            lastResultBanner: isNewQ ? null : this.matchState.lastResultBanner,
            winners: this.mergeBotScoresIntoWinners(msg.winners || []),
          };
          this.callbacks.onMatchUpdate({ ...this.matchState });

          // Bots answer during active server round too if enabled
          if (msg.status === 'active' && msg.question && this.simulatedPeersEnabled) {
            this.scheduleBotQuizAnswers();
          }
        } else if (msg.type === 'match:answer_result') {
          this.matchState = {
            ...this.matchState,
            myAnsweredId: msg.optionId,
            myPointsEarned: msg.pointsEarned,
            lastResultBanner: msg.isCorrect
              ? `Benar! Peringkat #${msg.rank} (+${msg.pointsEarned} poin)`
              : 'Kurang tepat! (0 poin)',
          };
          this.callbacks.onMatchUpdate({ ...this.matchState });
        } else if (msg.type === 'greeting:challenge' && msg.challenge) {
          this.callbacks.onGreetingChallenge(msg.challenge);
        } else if (msg.type === 'greeting:resolved') {
          if (msg.senderId === this.localId) {
            this.callbacks.onGreetingToast(
              `${msg.answererName} membalas sapaanmu dengan benar! Kamu dapat +${msg.senderBonus} poin & ${msg.answererName} +${msg.answererBonus} poin!`,
              'success'
            );
          } else if (msg.answererId === this.localId) {
            this.callbacks.onGreetingToast(
              `Balasan benar! Kamu dapat +${msg.answererBonus} poin & ${msg.senderName} +${msg.senderBonus} poin!`,
              'success'
            );
          } else {
            this.callbacks.onGreetingToast(
              `${msg.answererName} (+${msg.answererBonus}) membalas sapaan ${msg.senderName} (+${msg.senderBonus})!`,
              'info'
            );
          }
        } else if (msg.type === 'greeting:wrong') {
          this.callbacks.onGreetingToast(
            `Kurang tepat! Balasan yang benar: ${msg.correctReply}`,
            'warn'
          );
        } else if (msg.type === 'chat:message') {
          this.callbacks.onChatMessage({
            id: msg.id,
            playerId: msg.playerId,
            playerName: msg.playerName,
            color: msg.color,
            text: msg.text,
            subText: msg.subText,
            timestamp: msg.timestamp,
          });
        }
      };

      ws.onclose = () => {
        this.ws = null;
        if (this.disposed) return;
        this.mode = this.bc ? 'local-tab' : 'offline';
        this.callbacks.onStatusChange(this.mode);
        if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => this.connectWebSocket(), 3500);
      };

      ws.onerror = () => ws.close();
    } catch {
      this.mode = this.bc ? 'local-tab' : 'offline';
      this.callbacks.onStatusChange(this.mode);
    }
  }

  private mergeBotScoresIntoWinners(
    serverWinners: Array<{ id: string; name: string; color: string; score: number }>
  ) {
    if (!this.simulatedPeersEnabled) return serverWinners;
    const combined = [...serverWinners];
    for (const bot of this.bots) {
      if (!combined.some((w) => w.id === bot.id)) {
        combined.push({ id: bot.id, name: bot.name, color: bot.color, score: bot.score });
      }
    }
    return combined.sort((a, b) => b.score - a.score);
  }

  private emitCombinedScores(serverRows?: ScoreRow[]) {
    const map = new Map<string, ScoreRow>();
    if (serverRows) {
      for (const r of serverRows) map.set(r.id, r);
    } else {
      map.set(this.localId, {
        id: this.localId,
        name: this.localPlayer.name,
        color: this.localPlayer.color,
        score: this.localPlayer.score,
        zone: this.localPlayer.zone,
      });
      for (const p of this.remotePlayers.values()) {
        if (!p.isSimulatedBot) {
          map.set(p.id, {
            id: p.id,
            name: p.name,
            color: p.color,
            score: p.score,
            zone: p.zone,
          });
        }
      }
    }

    if (this.simulatedPeersEnabled) {
      for (const b of this.bots) {
        map.set(b.id, {
          id: b.id,
          name: b.name,
          color: b.color,
          score: b.score,
          zone: getZoneAtPosition(b.x, b.z),
          isSimulatedBot: true,
        });
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => b.score - a.score);
    this.callbacks.onScoresSync(sorted, this.localId);
  }

  private scheduleBotQuizAnswers() {
    if (!this.simulatedPeersEnabled) return;
    for (const bot of this.bots) {
      const delay = 2600 + Math.floor(Math.random() * 4500);
      window.setTimeout(() => {
        if (this.disposed || this.matchState.status !== 'active' || !this.simulatedPeersEnabled)
          return;
        if (Math.random() > 0.28) {
          bot.score += 60;
          this.emitCombinedScores();
        }
      }, delay);
    }
  }

  private upsertRemotePlayer(player: NetworkPlayer) {
    this.remotePlayers.set(player.id, { ...player });
    this.emitPlayers();
  }

  private removeRemotePlayer(id: string) {
    if (this.remotePlayers.delete(id)) {
      this.emitPlayers();
    }
  }

  private emitPlayers() {
    this.callbacks.onPlayersSync(Array.from(this.remotePlayers.values()));
  }

  public updateLocalTransform(
    x: number,
    y: number,
    z: number,
    rotY: number,
    animState: AnimState,
    zone: PlayerZoneStatus
  ) {
    this.localPlayer.x = x;
    this.localPlayer.y = y;
    this.localPlayer.z = z;
    this.localPlayer.rotY = rotY;
    this.localPlayer.animState = animState;
    this.localPlayer.zone = zone;

    const now = performance.now();
    if (now - this.lastSendAt < 50) return;
    this.lastSendAt = now;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'move',
          x: Number(x.toFixed(3)),
          y: Number(y.toFixed(3)),
          z: Number(z.toFixed(3)),
          rotY: Number(rotY.toFixed(3)),
          animState,
          zone,
          name: this.localPlayer.name,
          color: this.localPlayer.color,
        })
      );
    } else if (this.bc) {
      this.bc.postMessage({
        type: 'move',
        senderId: this.localId,
        player: this.localPlayer,
      });
    }
  }

  public updateProfile(name: string, color: string) {
    this.localPlayer.name = name;
    this.localPlayer.color = color;
    this.lastSendAt = 0;
    this.updateLocalTransform(
      this.localPlayer.x,
      this.localPlayer.y,
      this.localPlayer.z,
      this.localPlayer.rotY,
      this.localPlayer.animState,
      this.localPlayer.zone
    );
    this.emitCombinedScores();
  }

  public addObjectScore(vocabId: string, points: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'score:add', vocabId, points }));
    } else {
      this.localPlayer.score += points;
      this.emitCombinedScores();
    }
  }

  public startCompetitiveMatch() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'match:start' }));
      return;
    }

    // Offline / BroadcastChannel local match runner
    if (this.localMatchTimer !== null) window.clearTimeout(this.localMatchTimer);
    const items = [...VOCAB_ITEMS].sort(() => Math.random() - 0.5).slice(0, 6);
    let idx = 0;

    const runRound = () => {
      if (this.disposed) return;
      if (idx >= items.length) {
        this.matchState = {
          status: 'finished',
          question: null,
          myAnsweredId: null,
          myPointsEarned: null,
          lastResultBanner: null,
          winners: this.mergeBotScoresIntoWinners([
            {
              id: this.localId,
              name: this.localPlayer.name,
              color: this.localPlayer.color,
              score: this.localPlayer.score,
            },
          ]),
        };
        this.callbacks.onMatchUpdate({ ...this.matchState });
        return;
      }

      const item = items[idx];
      const distractors = VOCAB_ITEMS.filter((v) => v.id !== item.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      const q: CompetitiveQuestion = {
        questionId: `local_q_${idx}_${Date.now()}`,
        roundNumber: idx + 1,
        totalRounds: items.length,
        vocabId: item.id,
        zone: item.zone,
        promptType: Math.random() > 0.45 ? 'ar-to-id' : 'id-to-ar',
        promptArabic: item.arabic,
        promptTranslit: item.transliteration,
        promptIndonesian: item.indonesian,
        options: [item, ...distractors]
          .sort(() => Math.random() - 0.5)
          .map((v) => ({ id: v.id, label: v.indonesian, arabicLabel: v.arabic })),
        correctId: item.id,
        endsAt: Date.now() + 14_000,
      };

      this.matchState = {
        status: 'active',
        question: q,
        myAnsweredId: null,
        myPointsEarned: null,
        lastResultBanner: null,
        winners: [],
      };
      this.callbacks.onMatchUpdate({ ...this.matchState });
      this.scheduleBotQuizAnswers();

      idx += 1;
      this.localMatchTimer = window.setTimeout(runRound, 14_000);
    };

    runRound();
  }

  public submitCompetitiveAnswer(questionId: string, optionId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'match:answer', questionId, optionId }));
      return;
    }

    if (!this.matchState.question || this.matchState.question.questionId !== questionId) return;
    if (this.matchState.myAnsweredId !== null) return;

    const isCorrect = optionId === this.matchState.question.correctId;
    const pts = isCorrect ? 100 : 0;
    this.localPlayer.score += pts;
    this.matchState = {
      ...this.matchState,
      myAnsweredId: optionId,
      myPointsEarned: pts,
      lastResultBanner: isCorrect ? 'Benar! (+100 poin)' : 'Kurang tepat! (0 poin)',
    };
    this.callbacks.onMatchUpdate({ ...this.matchState });
    this.emitCombinedScores();
  }

  public sendGreetingChallenge(greetingId: string) {
    const def = GREETING_PAIRS.find((g) => g.id === greetingId) || GREETING_PAIRS[0];
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'greeting:send', greetingId: def.id }));
    } else {
      const challengeId = `gr_${this.localId}_${Date.now()}`;
      const challenge: GreetingChallenge = {
        id: challengeId,
        senderId: this.localId,
        senderName: this.localPlayer.name,
        senderColor: this.localPlayer.color,
        greetingId: def.id,
        promptArabic: def.promptArabic,
        promptTranslit: def.promptTranslit,
        promptMeaning: def.promptMeaning,
        options: [
          { text: def.correctReply, translit: def.replyTranslit, meaning: def.replyMeaning },
          { text: def.wrongReplies[0], translit: '', meaning: '' },
          { text: def.wrongReplies[1], translit: '', meaning: '' },
        ].sort(() => Math.random() - 0.5),
        correctReply: def.correctReply,
        expiresAt: Date.now() + 18_000,
      };
      this.callbacks.onChatMessage({
        id: `chat_${challengeId}`,
        playerId: this.localId,
        playerName: this.localPlayer.name,
        color: this.localPlayer.color,
        text: def.promptArabic,
        subText: `${def.promptTranslit} · ${def.promptMeaning}`,
        timestamp: Date.now(),
      });
      this.bc?.postMessage({ type: 'greeting:challenge', senderId: this.localId, challenge });
    }

    // If only solo with bots (or bots are active and no other human answers quickly), bot replies
    if (this.simulatedPeersEnabled) {
      const humanCount = Array.from(this.remotePlayers.values()).filter(
        (p) => !p.isSimulatedBot
      ).length;
      if (humanCount === 0) {
        window.setTimeout(() => {
          if (this.disposed || !this.simulatedPeersEnabled) return;
          const bot = this.bots[Math.floor(Math.random() * this.bots.length)];
          bot.score += 40;
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'score:add', points: 25 }));
          } else {
            this.localPlayer.score += 25;
          }
          this.callbacks.onChatMessage({
            id: `bot_reply_${Date.now()}`,
            playerId: bot.id,
            playerName: bot.name,
            color: bot.color,
            text: def.correctReply,
            subText: `${def.replyTranslit} (+40 untuk ${bot.name})`,
            timestamp: Date.now(),
          });
          this.callbacks.onGreetingToast(
            `${bot.name} menjawab sapaanmu dengan benar! Kamu dapat +25 poin & ${bot.name} +40 poin!`,
            'success'
          );
          this.emitCombinedScores();
        }, 1200);
      }
    }
  }

  public answerGreetingChallenge(challengeId: string, replyText: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && !challengeId.startsWith('sim_')) {
      this.ws.send(JSON.stringify({ type: 'greeting:answer', challengeId, replyText }));
      return;
    }

    const challenge = this.localGreetings.get(challengeId);
    if (!challenge) return;
    this.localGreetings.delete(challengeId);

    const isCorrect = replyText === challenge.correctReply;
    if (isCorrect) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'score:add', points: 40 }));
      } else {
        this.localPlayer.score += 40;
      }

      const bot = this.bots.find((b) => b.id === challenge.senderId);
      if (bot) bot.score += 25;

      this.callbacks.onChatMessage({
        id: `my_reply_${Date.now()}`,
        playerId: this.localId,
        playerName: this.localPlayer.name,
        color: this.localPlayer.color,
        text: replyText,
        subText: 'Balasan sapaan benar! (+40 poin)',
        timestamp: Date.now(),
      });

      this.bc?.postMessage({
        type: 'greeting:resolved',
        senderId: challenge.senderId,
        answererName: this.localPlayer.name,
        senderBonus: 25,
      });

      this.callbacks.onGreetingToast(
        `Balasan benar! Kamu dapat +40 poin & ${challenge.senderName} +25 poin!`,
        'success'
      );
      this.emitCombinedScores();
    } else {
      this.callbacks.onGreetingToast(
        `Kurang tepat! Balasan yang benar: ${challenge.correctReply}`,
        'warn'
      );
    }
  }

  public sendChat(text: string, subText?: string) {
    const clean = text.trim();
    if (!clean) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'chat', text: clean, subText }));
    } else {
      const msg: ChatBubbleMessage = {
        id: `${this.localId}-${Date.now()}`,
        playerId: this.localId,
        playerName: this.localPlayer.name,
        color: this.localPlayer.color,
        text: clean,
        subText,
        timestamp: Date.now(),
      };
      this.callbacks.onChatMessage(msg);
      this.bc?.postMessage({
        type: 'chat',
        senderId: this.localId,
        message: msg,
      });
    }
  }

  public setSimulatedPeersEnabled(enabled: boolean) {
    this.simulatedPeersEnabled = enabled;
    if (this.botMoveTimer !== null) {
      window.clearInterval(this.botMoveTimer);
      this.botMoveTimer = null;
    }
    if (this.botGreetTimer !== null) {
      window.clearInterval(this.botGreetTimer);
      this.botGreetTimer = null;
    }

    if (!enabled) {
      for (const b of this.bots) {
        this.remotePlayers.delete(b.id);
      }
      this.emitPlayers();
      this.emitCombinedScores();
      return;
    }

    const tickStepSec = 0.08;
    const stepBots = () => {
      for (const bot of this.bots) {
        const [tx, tz] = bot.waypoints[bot.waypointIdx];
        const dx = tx - bot.x;
        const dz = tz - bot.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.45) {
          bot.waypointIdx = (bot.waypointIdx + 1) % bot.waypoints.length;
        } else {
          const move = Math.min(dist, bot.speed * tickStepSec);
          bot.x += (dx / dist) * move;
          bot.z += (dz / dist) * move;
        }

        const rotY = Math.atan2(-dx, -dz);
        this.remotePlayers.set(bot.id, {
          id: bot.id,
          name: bot.name,
          color: bot.color,
          x: bot.x,
          y: 0,
          z: bot.z,
          rotY,
          animState: 'walk',
          zone: getZoneAtPosition(bot.x, bot.z),
          score: bot.score,
          isSimulatedBot: true,
        });
      }
      this.emitPlayers();
    };

    stepBots();
    this.botMoveTimer = window.setInterval(stepBots, 80);
    this.emitCombinedScores();

    // Bots occasionally send interactive greeting challenges for the player to reply & earn points!
    this.botGreetTimer = window.setInterval(() => {
      if (this.disposed || !this.simulatedPeersEnabled) return;
      const humanCount = Array.from(this.remotePlayers.values()).filter(
        (p) => !p.isSimulatedBot
      ).length;
      if (humanCount > 0) return; // Let real players challenge each other when multiple humans are connected

      const bot = this.bots[Math.floor(Math.random() * this.bots.length)];
      const def = GREETING_PAIRS[Math.floor(Math.random() * GREETING_PAIRS.length)];
      const challengeId = `sim_gr_${Date.now()}`;
      const challenge: GreetingChallenge = {
        id: challengeId,
        senderId: bot.id,
        senderName: bot.name,
        senderColor: bot.color,
        greetingId: def.id,
        promptArabic: def.promptArabic,
        promptTranslit: def.promptTranslit,
        promptMeaning: def.promptMeaning,
        options: [
          { text: def.correctReply, translit: def.replyTranslit, meaning: def.replyMeaning },
          { text: def.wrongReplies[0], translit: '', meaning: '' },
          { text: def.wrongReplies[1], translit: '', meaning: '' },
        ].sort(() => Math.random() - 0.5),
        correctReply: def.correctReply,
        expiresAt: Date.now() + 18_000,
      };
      this.localGreetings.set(challengeId, challenge);
      this.callbacks.onChatMessage({
        id: `sim_chat_${Date.now()}`,
        playerId: bot.id,
        playerName: bot.name,
        color: bot.color,
        text: def.promptArabic,
        subText: `${def.promptTranslit} · ${def.promptMeaning}`,
        timestamp: Date.now(),
      });
      this.callbacks.onGreetingChallenge(challenge);
    }, 15_000);
  }

  public dispose() {
    this.disposed = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.localMatchTimer !== null) window.clearTimeout(this.localMatchTimer);
    if (this.botMoveTimer !== null) window.clearInterval(this.botMoveTimer);
    if (this.botGreetTimer !== null) window.clearInterval(this.botGreetTimer);
    if (this.bc) {
      this.bc.postMessage({ type: 'leave', senderId: this.localId });
      this.bc.close();
    }
    this.ws?.close();
  }
}
