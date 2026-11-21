import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ZoneId = 'madrasah' | 'suq' | 'bayt';
type PlayerZoneStatus = ZoneId | 'central';

interface ServerPlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  animState: 'idle' | 'walk' | 'jump';
  zone: PlayerZoneStatus;
  score: number;
  discoveredVocabIds: Set<string>;
  lastSeen: number;
}

interface QuizBankItem {
  id: string;
  zone: ZoneId;
  arabic: string;
  translit: string;
  indonesian: string;
}

const SERVER_QUIZ_BANK: QuizBankItem[] = [
  { id: 'kitab', zone: 'madrasah', arabic: 'كِتَابٌ', translit: 'kitābun', indonesian: 'Buku' },
  { id: 'qalam', zone: 'madrasah', arabic: 'قَلَمٌ', translit: 'qalamun', indonesian: 'Pena' },
  { id: 'maktab', zone: 'madrasah', arabic: 'مَكْتَبٌ', translit: 'maktabun', indonesian: 'Meja Belajar' },
  { id: 'kursi', zone: 'madrasah', arabic: 'كُرْسِيٌّ', translit: 'kursiyyun', indonesian: 'Kursi' },
  { id: 'sabburah', zone: 'madrasah', arabic: 'سَبُّورَةٌ', translit: 'sabbūratun', indonesian: 'Papan Tulis' },
  { id: 'haqibah', zone: 'madrasah', arabic: 'حَقِيبَةٌ', translit: 'ḥaqībatun', indonesian: 'Tas Sekolah' },
  { id: 'tuffah', zone: 'suq', arabic: 'تُفَّاحٌ', translit: 'tuffāḥun', indonesian: 'Apel' },
  { id: 'mawz', zone: 'suq', arabic: 'مَوْزٌ', translit: 'mawzun', indonesian: 'Pisang' },
  { id: 'inab', zone: 'suq', arabic: 'عِنَبٌ', translit: 'ʿinabun', indonesian: 'Anggur' },
  { id: 'burtuqal', zone: 'suq', arabic: 'بُرْتُقَالٌ', translit: 'burtuqālun', indonesian: 'Jeruk' },
  { id: 'bittikh', zone: 'suq', arabic: 'بِطِّيخٌ', translit: 'biṭṭīkhun', indonesian: 'Semangka' },
  { id: 'manju', zone: 'suq', arabic: 'مَانْجُو', translit: 'mānjū', indonesian: 'Mangga' },
  { id: 'bab', zone: 'bayt', arabic: 'بَابٌ', translit: 'bābun', indonesian: 'Pintu' },
  { id: 'nafidhah', zone: 'bayt', arabic: 'نَافِذَةٌ', translit: 'nāfidhatun', indonesian: 'Jendela' },
  { id: 'misbah', zone: 'bayt', arabic: 'مِصْبَاحٌ', translit: 'miṣbāḥun', indonesian: 'Lampu' },
  { id: 'saah', zone: 'bayt', arabic: 'سَاعَةٌ', translit: 'sāʿatun', indonesian: 'Jam Dinding' },
  { id: 'maidah', zone: 'bayt', arabic: 'مَائِدَةٌ', translit: 'māʾidatun', indonesian: 'Meja Makan' },
  { id: 'arikah', zone: 'bayt', arabic: 'أَرِيكَةٌ', translit: 'arīkatun', indonesian: 'Sofa' },
];

interface GreetingDef {
  id: string;
  promptArabic: string;
  promptTranslit: string;
  promptMeaning: string;
  correctReply: string;
  replyTranslit: string;
  replyMeaning: string;
  wrongReplies: [string, string];
}

const SERVER_GREETINGS: GreetingDef[] = [
  {
    id: 'salam',
    promptArabic: 'السَّلَامُ عَلَيْكُمْ',
    promptTranslit: 'Assalāmu ʿalaykum',
    promptMeaning: 'Semoga kedamaian menyertaimu',
    correctReply: 'وَعَلَيْكُمُ السَّلَامُ',
    replyTranslit: 'Waʿalaykumus-salām',
    replyMeaning: 'Dan semoga kedamaian menyertaimu juga',
    wrongReplies: ['شُكْرًا جَزِيلًا', 'إِلَى اللِّقَاءِ'],
  },
  {
    id: 'sabah',
    promptArabic: 'صَبَاحُ الْخَيْرِ',
    promptTranslit: 'Ṣabāḥul-khayr',
    promptMeaning: 'Selamat pagi!',
    correctReply: 'صَبَاحُ النُّورِ',
    replyTranslit: 'Ṣabāḥun-nūr',
    replyMeaning: 'Selamat pagi juga!',
    wrongReplies: ['مَسَاءُ الْخَيْرِ', 'بِخَيْرٍ، شُكْرًا'],
  },
  {
    id: 'kayfa',
    promptArabic: 'كَيْفَ حَالُكَ؟',
    promptTranslit: 'Kayfa ḥāluka?',
    promptMeaning: 'Bagaimana kabarmu?',
    correctReply: 'بِخَيْرٍ، الْحَمْدُ لِلّٰهِ',
    replyTranslit: 'Bikhayr, alḥamdulillāh',
    replyMeaning: 'Baik, segala puji bagi Allah',
    wrongReplies: ['اِسْمِي زَيْدٌ', 'صَبَاحُ النُّورِ'],
  },
  {
    id: 'ahlan',
    promptArabic: 'أَهْلًا وَسَهْلًا!',
    promptTranslit: 'Ahlan wa sahlan!',
    promptMeaning: 'Selamat datang!',
    correctReply: 'أَهْلًا بِكَ!',
    replyTranslit: 'Ahlan bika!',
    replyMeaning: 'Senang bertemu denganmu!',
    wrongReplies: ['مَعَ السَّلَامَةِ', 'لَا أَفْهَمُ'],
  },
  {
    id: 'shukran',
    promptArabic: 'شُكْرًا جَزِيلًا',
    promptTranslit: 'Shukran jazīlan',
    promptMeaning: 'Terima kasih banyak',
    correctReply: 'عَفْوًا!',
    replyTranslit: 'ʿAfwan!',
    replyMeaning: 'Sama-sama!',
    wrongReplies: ['صَبَاحُ النُّورِ', 'وَعَلَيْكُمُ السَّلَامُ'],
  },
];

interface ActiveMatchQuestion {
  questionId: string;
  roundNumber: number;
  totalRounds: number;
  vocabId: string;
  zone: ZoneId;
  promptType: 'ar-to-id' | 'id-to-ar';
  promptArabic: string;
  promptTranslit: string;
  promptIndonesian: string;
  options: Array<{ id: string; label: string; arabicLabel: string }>;
  correctId: string;
  endsAt: number;
  answeredBy: Set<string>;
  correctOrder: number;
}

interface ActiveGreetingChallenge {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  greetingId: string;
  promptArabic: string;
  promptTranslit: string;
  promptMeaning: string;
  options: Array<{ text: string; translit: string; meaning: string }>;
  correctReply: string;
  answeredBy: Set<string>;
  expiresAt: number;
}

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const players = new Map<string, ServerPlayer>();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, players: players.size });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  const socketsById = new Map<string, WebSocket>();
  const idBySocket = new Map<WebSocket, string>();

  // Server-authoritative competitive match state
  let matchStatus: 'lobby' | 'active' | 'finished' = 'lobby';
  let currentQuestion: ActiveMatchQuestion | null = null;
  let matchQueue: QuizBankItem[] = [];
  let matchRound = 0;
  const TOTAL_ROUNDS = 6;
  const activeGreetings = new Map<string, ActiveGreetingChallenge>();

  function serializePlayer(p: ServerPlayer) {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: p.rotY,
      animState: p.animState,
      zone: p.zone,
      score: p.score,
    };
  }

  function broadcast(payload: object, excludeSocket?: WebSocket) {
    const raw = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  function broadcastScores() {
    const scores = Array.from(players.values())
      .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score, zone: p.zone }))
      .sort((a, b) => b.score - a.score);
    broadcast({ type: 'scores:sync', scores });
  }

  function buildQuestionForRound(item: QuizBankItem, roundNum: number): ActiveMatchQuestion {
    const distractors = SERVER_QUIZ_BANK.filter((v) => v.id !== item.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const options = [item, ...distractors]
      .sort(() => Math.random() - 0.5)
      .map((v) => ({ id: v.id, label: v.indonesian, arabicLabel: v.arabic }));
    const promptType = Math.random() > 0.45 ? 'ar-to-id' : 'id-to-ar';

    return {
      questionId: `q_${Date.now()}_${roundNum}`,
      roundNumber: roundNum,
      totalRounds: TOTAL_ROUNDS,
      vocabId: item.id,
      zone: item.zone,
      promptType,
      promptArabic: item.arabic,
      promptTranslit: item.translit,
      promptIndonesian: item.indonesian,
      options,
      correctId: item.id,
      endsAt: Date.now() + 14_000,
      answeredBy: new Set(),
      correctOrder: 0,
    };
  }

  function serializeQuestion(q: ActiveMatchQuestion) {
    return {
      questionId: q.questionId,
      roundNumber: q.roundNumber,
      totalRounds: q.totalRounds,
      vocabId: q.vocabId,
      zone: q.zone,
      promptType: q.promptType,
      promptArabic: q.promptArabic,
      promptTranslit: q.promptTranslit,
      promptIndonesian: q.promptIndonesian,
      options: q.options,
      correctId: q.correctId,
      endsAt: q.endsAt,
    };
  }

  function startMatch() {
    matchQueue = [...SERVER_QUIZ_BANK].sort(() => Math.random() - 0.5).slice(0, TOTAL_ROUNDS);
    matchRound = 1;
    matchStatus = 'active';
    currentQuestion = buildQuestionForRound(matchQueue[0], 1);
    broadcast({
      type: 'match:state',
      status: matchStatus,
      question: serializeQuestion(currentQuestion),
      winners: [],
    });
  }

  function advanceMatchRound() {
    if (matchStatus !== 'active') return;
    if (matchRound >= TOTAL_ROUNDS) {
      matchStatus = 'finished';
      currentQuestion = null;
      const winners = Array.from(players.values())
        .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score }))
        .sort((a, b) => b.score - a.score);
      broadcast({
        type: 'match:state',
        status: 'finished',
        question: null,
        winners,
      });
      return;
    }

    matchRound += 1;
    currentQuestion = buildQuestionForRound(matchQueue[matchRound - 1], matchRound);
    broadcast({
      type: 'match:state',
      status: 'active',
      question: serializeQuestion(currentQuestion),
      winners: [],
    });
  }

  // Server tick for match timer & greeting cleanup
  setInterval(() => {
    const now = Date.now();
    if (matchStatus === 'active' && currentQuestion && now >= currentQuestion.endsAt) {
      advanceMatchRound();
    }
    for (const [gid, g] of activeGreetings.entries()) {
      if (now >= g.expiresAt) {
        activeGreetings.delete(gid);
      }
    }
    for (const [id, p] of players.entries()) {
      if (now - p.lastSeen > 45_000) {
        players.delete(id);
        socketsById.delete(id);
        broadcast({ type: 'player:left', playerId: id });
        broadcastScores();
      }
    }
  }, 1000);

  wss.on('connection', (ws) => {
    let playerId: string | null = null;

    ws.on('message', (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === 'join' && msg.id) {
        playerId = msg.id;
        const player: ServerPlayer = {
          id: msg.id,
          name: (msg.name || 'Pelajar').slice(0, 22),
          color: msg.color || '#2563EB',
          x: typeof msg.x === 'number' ? msg.x : 0,
          y: typeof msg.y === 'number' ? msg.y : 0,
          z: typeof msg.z === 'number' ? msg.z : 6,
          rotY: typeof msg.rotY === 'number' ? msg.rotY : Math.PI,
          animState: msg.animState || 'idle',
          zone: msg.zone || 'central',
          score: typeof msg.score === 'number' ? msg.score : 0,
          discoveredVocabIds: new Set(),
          lastSeen: Date.now(),
        };

        players.set(playerId!, player);
        socketsById.set(playerId!, ws);
        idBySocket.set(ws, playerId!);

        const existingPlayers = Array.from(players.values())
          .filter((p) => p.id !== playerId)
          .map(serializePlayer);

        ws.send(
          JSON.stringify({
            type: 'init',
            players: existingPlayers,
            match: {
              status: matchStatus,
              question: currentQuestion ? serializeQuestion(currentQuestion) : null,
            },
          })
        );

        broadcast({ type: 'player:joined', player: serializePlayer(player) }, ws);
        broadcastScores();
      } else if (msg.type === 'move' && playerId) {
        const existing = players.get(playerId);
        if (!existing) return;

        if (typeof msg.x === 'number') existing.x = msg.x;
        if (typeof msg.y === 'number') existing.y = msg.y;
        if (typeof msg.z === 'number') existing.z = msg.z;
        if (typeof msg.rotY === 'number') existing.rotY = msg.rotY;
        if (msg.animState) existing.animState = msg.animState;
        if (msg.zone) existing.zone = msg.zone;
        if (msg.name) existing.name = msg.name.slice(0, 22);
        if (msg.color) existing.color = msg.color;
        existing.lastSeen = Date.now();

        broadcast({ type: 'player:updated', player: serializePlayer(existing) }, ws);
      } else if (msg.type === 'score:add' && playerId) {
        const existing = players.get(playerId);
        if (!existing) return;
        const delta = Math.min(Math.max(Number(msg.points) || 0, 0), 100);
        if (msg.vocabId && existing.discoveredVocabIds.has(msg.vocabId)) {
          return; // Prevent duplicate object points
        }
        if (msg.vocabId) existing.discoveredVocabIds.add(msg.vocabId);
        existing.score += delta;
        broadcastScores();
      } else if (msg.type === 'match:start' && playerId) {
        if (matchStatus !== 'active') {
          startMatch();
        }
      } else if (msg.type === 'match:answer' && playerId && currentQuestion) {
        if (msg.questionId !== currentQuestion.questionId) return;
        if (currentQuestion.answeredBy.has(playerId)) return;
        currentQuestion.answeredBy.add(playerId);

        const player = players.get(playerId);
        if (!player) return;

        const isCorrect = msg.optionId === currentQuestion.correctId;
        let pts = 0;
        if (isCorrect) {
          currentQuestion.correctOrder += 1;
          pts =
            currentQuestion.correctOrder === 1
              ? 100
              : currentQuestion.correctOrder === 2
              ? 80
              : 60;
          player.score += pts;
        }

        ws.send(
          JSON.stringify({
            type: 'match:answer_result',
            questionId: currentQuestion.questionId,
            optionId: msg.optionId,
            isCorrect,
            pointsEarned: pts,
            rank: currentQuestion.correctOrder,
          })
        );
        broadcastScores();

        // Advance early if all connected players have answered
        if (currentQuestion.answeredBy.size >= players.size && players.size > 0) {
          setTimeout(() => {
            if (currentQuestion && currentQuestion.answeredBy.size >= players.size) {
              advanceMatchRound();
            }
          }, 1200);
        }
      } else if (msg.type === 'greeting:send' && playerId) {
        const sender = players.get(playerId);
        if (!sender) return;
        const def = SERVER_GREETINGS.find((g) => g.id === msg.greetingId) || SERVER_GREETINGS[0];

        const challengeId = `gr_${playerId}_${Date.now()}`;
        const options = [
          { text: def.correctReply, translit: def.replyTranslit, meaning: def.replyMeaning },
          { text: def.wrongReplies[0], translit: '', meaning: '' },
          { text: def.wrongReplies[1], translit: '', meaning: '' },
        ].sort(() => Math.random() - 0.5);

        const challenge: ActiveGreetingChallenge = {
          id: challengeId,
          senderId: sender.id,
          senderName: sender.name,
          senderColor: sender.color,
          greetingId: def.id,
          promptArabic: def.promptArabic,
          promptTranslit: def.promptTranslit,
          promptMeaning: def.promptMeaning,
          options,
          correctReply: def.correctReply,
          answeredBy: new Set(),
          expiresAt: Date.now() + 18_000,
        };
        activeGreetings.set(challengeId, challenge);

        // Broadcast speech bubble + interactive challenge to other players
        broadcast({
          type: 'chat:message',
          id: `chat_${challengeId}`,
          playerId: sender.id,
          playerName: sender.name,
          color: sender.color,
          text: def.promptArabic,
          subText: `${def.promptTranslit} · ${def.promptMeaning}`,
          timestamp: Date.now(),
        });

        broadcast(
          {
            type: 'greeting:challenge',
            challenge: {
              id: challenge.id,
              senderId: challenge.senderId,
              senderName: challenge.senderName,
              senderColor: challenge.senderColor,
              greetingId: challenge.greetingId,
              promptArabic: challenge.promptArabic,
              promptTranslit: challenge.promptTranslit,
              promptMeaning: challenge.promptMeaning,
              options: challenge.options,
              correctReply: challenge.correctReply,
              expiresAt: challenge.expiresAt,
            },
          },
          ws
        );
      } else if (msg.type === 'greeting:answer' && playerId) {
        const challenge = activeGreetings.get(msg.challengeId);
        if (!challenge) return;
        if (challenge.senderId === playerId) return;
        if (challenge.answeredBy.has(playerId)) return;

        const answerer = players.get(playerId);
        if (!answerer) return;
        challenge.answeredBy.add(playerId);

        const isCorrect = msg.replyText === challenge.correctReply;
        if (isCorrect) {
          answerer.score += 40;
          const sender = players.get(challenge.senderId);
          if (sender) {
            sender.score += 25;
          }

          // Show answerer's reply speech bubble above their avatar
          broadcast({
            type: 'chat:message',
            id: `reply_${challenge.id}_${playerId}`,
            playerId: answerer.id,
            playerName: answerer.name,
            color: answerer.color,
            text: msg.replyText,
            subText: 'Balasan sapaan benar! (+40 poin)',
            timestamp: Date.now(),
          });

          broadcast({
            type: 'greeting:resolved',
            challengeId: challenge.id,
            senderId: challenge.senderId,
            senderName: challenge.senderName,
            answererId: answerer.id,
            answererName: answerer.name,
            senderBonus: 25,
            answererBonus: 40,
            replyText: msg.replyText,
          });
          broadcastScores();
        } else {
          ws.send(
            JSON.stringify({
              type: 'greeting:wrong',
              challengeId: challenge.id,
              correctReply: challenge.correctReply,
            })
          );
        }
      } else if (msg.type === 'chat' && playerId && msg.text) {
        const sender = players.get(playerId);
        if (!sender) return;
        const cleanText = msg.text.trim().slice(0, 140);
        if (!cleanText) return;

        broadcast({
          type: 'chat:message',
          id: `${playerId}-${Date.now()}`,
          playerId,
          playerName: sender.name,
          color: sender.color,
          text: cleanText,
          subText: msg.subText ? msg.subText.trim().slice(0, 140) : undefined,
          timestamp: Date.now(),
        });
      }
    });

    ws.on('close', () => {
      const id = idBySocket.get(ws);
      if (id) {
        idBySocket.delete(ws);
        if (socketsById.get(id) === ws) {
          socketsById.delete(id);
          players.delete(id);
          broadcast({ type: 'player:left', playerId: id });
          broadcastScores();
        }
      }
    });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Madrasti 3D competitive quiz server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
