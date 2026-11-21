import { Crown, Eye, EyeOff, MessageCircle, Play, Timer, Trophy, Volume2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ScoreRow } from '../game/network';
import { speakArabic } from '../game/speech';
import type { CompetitiveMatchState, GreetingChallenge } from '../game/types';
import { stripHarakat, ZONE_INFO } from '../game/vocabData';

interface LiveLeaderboardProps {
  scores: ScoreRow[];
  localId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function LiveLeaderboard({
  scores,
  localId,
  collapsed,
  onToggleCollapse,
}: LiveLeaderboardProps) {
  return (
    <div className="pointer-events-auto w-64 rounded-2xl bg-white/95 shadow-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="font-display text-xs font-bold text-slate-900">
            Papan Skor ({scores.length} Pemain)
          </span>
        </div>
        <span className="text-[11px] font-semibold text-blue-700">
          {collapsed ? 'Buka' : 'Tutup'}
        </span>
      </button>

      {!collapsed && (
        <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100">
          {scores.map((row, idx) => {
            const isMe = row.id === localId;
            return (
              <li
                key={row.id}
                className={`flex items-center justify-between gap-2 px-3.5 py-2 text-xs ${
                  isMe ? 'bg-blue-50/80' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 text-center font-bold tabular-nums ${
                      idx === 0 ? 'text-amber-600' : 'text-slate-500'
                    }`}
                  >
                    {idx === 0 ? <Crown className="h-3.5 w-3.5 inline text-amber-500" /> : `#${idx + 1}`}
                  </span>
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                  <div className="min-w-0">
                    <p dir="auto" className="font-semibold text-slate-900 truncate">
                      {row.name}
                      {isMe ? ' (Kamu)' : ''}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {ZONE_INFO[row.zone]?.id || 'Alun-Alun'}
                    </p>
                  </div>
                </div>
                <span className="font-display font-extrabold text-slate-900 tabular-nums shrink-0">
                  {row.score}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface CompetitiveQuizBannerProps {
  match: CompetitiveMatchState;
  localId: string;
  onStartMatch: () => void;
  onAnswer: (questionId: string, optionId: string) => void;
  onDismissWinner: () => void;
}

export function CompetitiveQuizBanner({
  match,
  localId,
  onStartMatch,
  onAnswer,
  onDismissWinner,
}: CompetitiveQuizBannerProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showHarakat, setShowHarakat] = useState(true);

  useEffect(() => {
    if (match.status !== 'active' || !match.question) return;
    const updateTimer = () => {
      const rem = Math.max(0, Math.ceil((match.question!.endsAt - Date.now()) / 1000));
      setSecondsLeft(rem);
    };
    updateTimer();
    const id = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(id);
  }, [match.status, match.question]);

  if (match.status === 'lobby') return null;

  if (match.status === 'finished') {
    const champion = match.winners[0];
    return (
      <div className="pointer-events-auto fixed top-20 left-1/2 z-30 w-[min(460px,92vw)] -translate-x-1/2 rounded-2xl bg-white p-5 shadow-2xl border border-amber-300">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            <h3 className="font-display text-base font-extrabold text-slate-900">
              Hasil Lomba Kuis Online!
            </h3>
          </div>
          <button
            type="button"
            onClick={onDismissWinner}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup hasil lomba"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {champion && (
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
            <p className="text-xs font-semibold text-amber-800">Pemenang Skor Tertinggi</p>
            <p dir="auto" className="mt-0.5 font-display text-xl font-extrabold text-slate-900">
              {champion.name}
              {champion.id === localId ? ' (Kamu!)' : ''} — {champion.score} Poin
            </p>
          </div>
        )}

        <ul className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
          {match.winners.slice(0, 5).map((w, idx) => (
            <li
              key={w.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs"
            >
              <span className="font-semibold text-slate-800">
                #{idx + 1} {w.name}
                {w.id === localId ? ' (Kamu)' : ''}
              </span>
              <span className="font-bold text-slate-900 tabular-nums">{w.score} Poin</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onStartMatch}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
        >
          <Play className="h-4 w-4" />
          <span>Mainkan Ronde Lomba Baru</span>
        </button>
      </div>
    );
  }

  const q = match.question;
  if (!q) return null;

  const formatAr = (t: string) => (showHarakat ? t : stripHarakat(t));

  return (
    <div className="pointer-events-auto fixed top-20 left-1/2 z-20 w-[min(520px,94vw)] -translate-x-1/2 rounded-2xl bg-white/95 p-4 shadow-2xl border border-blue-200">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-blue-600 px-2 py-0.5 font-bold text-white tabular-nums">
            Lomba Soal {q.roundNumber}/{q.totalRounds}
          </span>
          <span className="font-semibold text-slate-600">{ZONE_INFO[q.zone].id}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHarakat((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            {showHarakat ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            <span>{showHarakat ? 'Harakat' : 'Gundul'}</span>
          </button>
          <span className="inline-flex items-center gap-1 font-bold text-amber-700 tabular-nums">
            <Timer className="h-3.5 w-3.5" />
            {secondsLeft}s
          </span>
        </div>
      </div>

      {/* Question Prompt */}
      <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-2.5 border border-slate-200">
        <div className="min-w-0 flex-1">
          {q.promptType === 'ar-to-id' ? (
            <>
              <p className="text-[11px] font-semibold text-slate-500">
                Tercepat klik arti Bahasa Indonesia yang tepat:
              </p>
              <p dir="rtl" lang="ar" className="font-arabic text-3xl font-bold text-slate-900">
                {formatAr(q.promptArabic)}
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold text-slate-500">
                Tercepat klik kata Bahasa Arab untuk:
              </p>
              <p className="font-display text-xl font-extrabold text-slate-900">
                {q.promptIndonesian}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => speakArabic(q.promptArabic)}
          className="rounded-xl bg-white p-2.5 text-blue-600 border border-slate-200 hover:bg-blue-50 shrink-0"
          aria-label="Dengar soal"
        >
          <Volume2 className="h-4 w-4" />
        </button>
      </div>

      {/* 4 Clickable Options */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {q.options.map((opt) => {
          const isPicked = match.myAnsweredId === opt.id;
          const isCorrect = opt.id === q.correctId;
          let btnClass = 'border-slate-200 bg-white text-slate-900 hover:border-blue-500 hover:bg-blue-50';
          if (match.myAnsweredId !== null) {
            if (isCorrect) {
              btnClass = 'border-emerald-500 bg-emerald-50 text-emerald-900';
            } else if (isPicked) {
              btnClass = 'border-red-400 bg-red-50 text-red-900';
            } else {
              btnClass = 'border-slate-200 bg-white text-slate-400';
            }
          }

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onAnswer(q.questionId, opt.id)}
              disabled={match.myAnsweredId !== null}
              className={`rounded-xl border px-3 py-2 text-center font-semibold transition-colors ${btnClass}`}
            >
              {q.promptType === 'id-to-ar' ? (
                <span dir="rtl" lang="ar" className="font-arabic text-xl font-bold">
                  {formatAr(opt.arabicLabel)}
                </span>
              ) : (
                <span className="text-xs sm:text-sm font-bold">{opt.label}</span>
              )}
            </button>
          );
        })}
      </div>

      {match.lastResultBanner && (
        <p className="mt-2 text-center text-xs font-bold text-blue-700">{match.lastResultBanner}</p>
      )}
    </div>
  );
}

interface IncomingGreetingCardProps {
  challenge: GreetingChallenge | null;
  onReply: (challengeId: string, replyText: string) => void;
  onDismiss: () => void;
}

export function IncomingGreetingCard({
  challenge,
  onReply,
  onDismiss,
}: IncomingGreetingCardProps) {
  if (!challenge) return null;

  return (
    <div className="pointer-events-auto fixed bottom-36 left-4 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-4 shadow-2xl border border-emerald-300">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-xs font-bold text-emerald-800">
            Sapaan Berpoin · +40 untukmu!
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-0.5 text-slate-400 hover:text-slate-700"
          aria-label="Tutup tantangan sapaan"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-1.5 text-xs text-slate-600">
        <strong dir="auto" className="text-slate-900">
          {challenge.senderName}
        </strong>{' '}
        menyapa kamu (+25 poin untuk penanya jika benar):
      </p>

      <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-center border border-slate-200">
        <p dir="rtl" lang="ar" className="font-arabic text-2xl font-bold text-slate-900">
          {challenge.promptArabic}
        </p>
        <p className="text-[11px] text-blue-700 font-semibold">{challenge.promptTranslit}</p>
      </div>

      <div className="mt-2.5 space-y-1.5">
        {challenge.options.map((opt) => (
          <button
            key={opt.text}
            type="button"
            onClick={() => onReply(challenge.id, opt.text)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
          >
            <span dir="rtl" lang="ar" className="font-arabic text-base font-bold text-slate-900">
              {opt.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
