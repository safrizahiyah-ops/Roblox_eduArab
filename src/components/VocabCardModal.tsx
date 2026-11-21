import { CheckCircle2, Trophy, Volume2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { playSuccessChime, speakArabic } from '../game/speech';
import type { VocabItem } from '../game/types';
import { VOCAB_ITEMS, ZONE_INFO } from '../game/vocabData';

interface VocabCardModalProps {
  item: VocabItem;
  isScored: boolean;
  onScored: (vocabId: string, points: number) => void;
  onClose: () => void;
}

export function VocabCardModal({ item, isScored, onScored, onClose }: VocabCardModalProps) {
  const [speakingPart, setSpeakingPart] = useState<'word' | 'sentence' | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [pickedOptionId, setPickedOptionId] = useState<string | null>(null);

  const zoneInfo = ZONE_INFO[item.zone];

  // Build a 3-choice quick challenge for this 3D object
  const challengeOptions = useMemo(() => {
    const distractors = VOCAB_ITEMS.filter((v) => v.id !== item.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    return [item, ...distractors].sort(() => Math.random() - 0.5);
  }, [item]);

  const handleSpeak = (text: string, part: 'word' | 'sentence') => {
    setSpeakingPart(part);
    const res = speakArabic(text, () => setSpeakingPart(null));
    if (!res.supported) {
      setVoiceNote(
        'Browser ini belum mendukung Web Speech API. Memutar nada panduan — silakan gunakan transliterasi Latin.'
      );
    } else if (!res.hasArabicVoice) {
      setVoiceNote(
        'Suara TTS Bahasa Arab (ar-SA) belum terinstal di perangkat ini. Gunakan transliterasi Latin sebagai panduan baca.'
      );
    } else {
      setVoiceNote(null);
    }
  };

  const handlePickChallenge = (optId: string) => {
    if (isScored || pickedOptionId === item.id) return;
    setPickedOptionId(optId);
    if (optId === item.id) {
      playSuccessChime();
      onScored(item.id, 50);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Kartu Kosakata ${item.indonesian}`}
      >
        {/* Metadata Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span className="font-semibold text-slate-800">{zoneInfo.id}</span>
            <span aria-hidden="true">·</span>
            <span dir="rtl" lang="ar" className="font-arabic text-sm font-bold text-slate-700">
              {zoneInfo.arabic}
            </span>
            <span aria-hidden="true">·</span>
            <span>{item.category}</span>
            {isScored && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  +50 Poin Diraih
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Tutup kartu kosakata"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Primary Arabic Word with Full Harakat */}
        <div className="mt-4 rounded-xl bg-slate-50 p-5 border border-slate-200">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p
                dir="rtl"
                lang="ar"
                className="font-arabic text-5xl font-bold text-slate-900 text-right py-1"
              >
                {item.arabic}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-blue-700">{item.transliteration}</span>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <span className="font-semibold text-slate-800">
                  {isScored || pickedOptionId === item.id ? item.indonesian : '??? (Jawab di bawah)'}
                </span>
              </div>
              <p dir="auto" className="mt-1 text-xs text-slate-500">
                {item.wordForm}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleSpeak(item.arabic, 'word')}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                speakingPart === 'word'
                  ? 'bg-blue-700 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Volume2 className="h-4 w-4" />
              <span>{speakingPart === 'word' ? 'Memutar...' : 'Dengarkan'}</span>
            </button>
          </div>
        </div>

        {/* Interactive Point Challenge for this 3D Object */}
        {!isScored ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Trophy className="h-4 w-4 text-amber-600" />
              <span>Pertanyaan Benda · Klik arti yang tepat untuk meraih +50 Poin!</span>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {challengeOptions.map((opt) => {
                const isWrongPick = pickedOptionId === opt.id && opt.id !== item.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handlePickChallenge(opt.id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      isWrongPick
                        ? 'border-red-300 bg-red-100 text-red-800'
                        : 'border-amber-200 bg-white text-slate-800 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    {opt.indonesian}
                  </button>
                );
              })}
            </div>
            {pickedOptionId && pickedOptionId !== item.id && (
              <p className="mt-2 text-xs font-semibold text-red-700">
                Belum tepat, coba klik jawaban lain!
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
            Arti: <strong>{item.indonesian}</strong> — Poin benda ini (+50) sudah masuk ke papan skor!
          </div>
        )}

        {/* Example Arabic Phrase / Sentence */}
        <div className="mt-4 rounded-xl bg-white p-4 border border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">Contoh Kalimat Berharakat</span>
            <button
              type="button"
              onClick={() => handleSpeak(item.exampleArabic, 'sentence')}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>{speakingPart === 'sentence' ? 'Memutar...' : 'Dengarkan Kalimat'}</span>
            </button>
          </div>

          <p
            dir="rtl"
            lang="ar"
            className="mt-2 font-arabic text-2xl font-bold text-slate-900 text-right py-1"
          >
            {item.exampleArabic}
          </p>

          <p className="mt-1 text-xs font-semibold text-blue-700">{item.exampleTransliteration}</p>
          <p className="mt-1 text-sm text-slate-600">"{item.exampleMeaningId}"</p>
        </div>

        {voiceNote && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {voiceNote}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Lanjut Cari Poin
          </button>
        </div>
      </div>
    </div>
  );
}
