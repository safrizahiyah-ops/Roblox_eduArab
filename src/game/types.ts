export type ZoneId = 'madrasah' | 'suq' | 'bayt';

export type PlayerZoneStatus = ZoneId | 'central';

export type AnimState = 'idle' | 'walk' | 'jump';

export interface VocabItem {
  id: string;
  zone: ZoneId;
  arabic: string;
  transliteration: string;
  indonesian: string;
  wordForm: string;
  category: string;
  exampleArabic: string;
  exampleTransliteration: string;
  exampleMeaningId: string;
  position: [number, number, number];
}

export interface QuizKioskTarget {
  type: 'kiosk';
  zone: ZoneId;
  title: string;
  arabicTitle: string;
  position: [number, number, number];
}

export interface VocabTarget {
  type: 'vocab';
  item: VocabItem;
}

export type InteractTarget = VocabTarget | QuizKioskTarget;

export interface GreetingPair {
  id: string;
  promptArabic: string;
  promptTranslit: string;
  promptMeaning: string;
  correctReply: string;
  replyTranslit: string;
  replyMeaning: string;
  wrongReplies: [string, string];
}

export interface NetworkPlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  animState: AnimState;
  zone: PlayerZoneStatus;
  score: number;
  isSimulatedBot?: boolean;
}

export interface ChatBubbleMessage {
  id: string;
  playerId: string;
  playerName: string;
  color: string;
  text: string;
  subText?: string;
  timestamp: number;
}

export interface ProjectedLabel {
  id: string;
  name: string;
  color: string;
  score: number;
  zone: PlayerZoneStatus;
  x: number;
  y: number;
  visible: boolean;
  bubbleText?: string;
  bubbleSubText?: string;
  isSelf?: boolean;
}

export interface CompetitiveQuestionOption {
  id: string;
  label: string;
  arabicLabel: string;
}

export interface CompetitiveQuestion {
  questionId: string;
  roundNumber: number;
  totalRounds: number;
  vocabId: string;
  zone: ZoneId;
  promptType: 'ar-to-id' | 'id-to-ar';
  promptArabic: string;
  promptTranslit: string;
  promptIndonesian: string;
  options: CompetitiveQuestionOption[];
  correctId: string;
  endsAt: number;
}

export interface CompetitiveMatchState {
  status: 'lobby' | 'active' | 'finished';
  question: CompetitiveQuestion | null;
  myAnsweredId: string | null;
  myPointsEarned: number | null;
  lastResultBanner: string | null;
  winners: Array<{ id: string; name: string; color: string; score: number }>;
}

export interface GreetingChallenge {
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
  expiresAt: number;
}
