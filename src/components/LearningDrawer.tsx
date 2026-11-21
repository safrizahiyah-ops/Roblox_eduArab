import { Award, BookOpen, CheckCircle2, Eye, EyeOff, HelpCircle, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { playSuccessChime, speakArabic } from '../game/speech';
import type { VocabItem, ZoneId } from '../game/types';
import { stripHarakat, VOCAB_ITEMS, ZONE_INFO, ZONE_LIST } from '../game/vocabData';

interface LearningDrawerProps {
  openTab: 'zones' | 'vocab' | 'quiz' | null;
  quizZoneFilter: ZoneId | 'all';
  score: number;
  streak: number;
  discoveredIds: Set<string>;
  onClose: () => void;
  onChangeTab: (tab: 'zones' | 'vocab' | 'quiz') => void;
  onChangeQuizZone: (zone: ZoneId | 'all') => void;
  onInspectItem: (item: VocabItem) => void;
  onQuizAnswer: (isCorrect: boolean) => void;
}

type QuizPromptType = 'ar-to-id' | 'id-to-ar' | 'audio-to-id';

interface QuizQuestion {
  target: VocabItem;
  options: VocabItem[];
  promptType: QuizPromptType;
}

function buildQuizQuestion(zoneFilter: ZoneId | 'all', excludeId?: string): QuizQuestion {
  const zonePool =
    zoneFilter === 'all' ? VOCAB_ITEMS : VOCAB_ITEMS.filter((v) => v.zone === zoneFilter);
  const candidates = zonePool.filter((v) => v.id !== excludeId);
  const target =
    candidates[Math.floor(Math.random() * candidates.length)] ||
    zonePool[Math.floor(Math.random() * zonePool.length)];

  // Use same-zone distractors first, then global items if needed
  const otherZoneItems = VOCAB_ITEMS.filter((v) => v.id !== target.id).sort(
    () => Math.random() - 0.5
  );
  const distractors = otherZoneItems.slice(0, 3);
  const options = [target, ...distractors].sort(() => Math.random() - 0.5);

  const modes: QuizPromptType[] = ['ar-to-id', 'id-to-ar', 'audio-to-id'];
  const promptType = modes[Math.floor(Math.random() * modes.length)];
  return { target, options, promptType };
}

export function LearningDrawer({
  openTab,
  quizZoneFilter,
  score,
  streak,
  discoveredIds,
  onClose,
  onChangeTab,
  onChangeQuizZone,
  onInspectItem,
  onQuizAnswer,
}: LearningDrawerProps) {
  const [vocabZoneFilter, setVocabZoneFilter] = useState<ZoneId | 'all'>('all');
  const [showHarakat, setShowHarakat] = useState(true);
  const [quizQ, setQuizQ] = useState<QuizQuestion>(() => buildQuizQuestion(quizZoneFilter));
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [ttsHint, setTtsHint] = useState<string | null>(null);

  // Rebuild question automatically when zone filter changes
  useEffect(() => {
    setSelectedOptionId(null);
    setQuizQ(buildQuizQuestion(quizZoneFilter));
  }, [quizZoneFilter]);

  const zoneProgress = useMemo(() => {
    return ZONE_LIST.map((zId) => {
      const items = VOCAB_ITEMS.filter((v) => v.zone === zId);
      const found = items.filter((v) => discoveredIds.has(v.id)).length;
      return {
        zoneId: zId,
        info: ZONE_INFO[zId],
        found,
        total: items.length,
        done: found >= items.length,
      };
    });
  }, [discoveredIds]);

  const filteredVocab = useMemo(() => {
    if (vocabZoneFilter === 'all') return VOCAB_ITEMS;
    return VOCAB_ITEMS.filter((v) => v.zone === vocabZoneFilter);
  }, [vocabZoneFilter]);

  if (!openTab) return null;

  const formatArabic = (text: string) => (showHarakat ? text : stripHarakat(text));

  const handlePlayQuizAudio = () => {
    const res = speakArabic(quizQ.target.arabic);
    if (!res.hasArabicVoice) {
      setTtsHint('Perangkat belum memiliki suara Arab — silakan baca kata atau aktifkan harakat.');
    } else {
      setTtsHint(null);
    }
  };

  const handleAnswer = (optionId: string) => {
    if (selectedOptionId !== null) return;
    setSelectedOptionId(optionId);
    const correct = optionId === quizQ.target.id;
    if (correct) {
      playSuccessChime();
    }
    onQuizAnswer(correct);
  };

  const handleNextQuestion = () => {
    setSelectedOptionId(null);
    setTtsHint(null);
    setQuizQ(buildQuizQuestion(quizZoneFilter, quizQ.target.id));
  };

  return (
    <aside
      className="fixed top-20 right-4 bottom-24 z-20 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
      aria-label="Panel Pembelajaran Bahasa Arab"
    >
      {/* Header & Tabs */}
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Pusat Belajar Bahasa Arab
            </h2>
            <p className="text-xs text-slate-500 tabular-nums">
              {discoveredIds.size}/{VOCAB_ITEMS.length} kosakata · {score} poin · Streak {streak}x
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => onChangeTab('zones')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              openTab === 'zones'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="h-3.5 w-3.5" />
            <span>Progres Zona</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('vocab')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              openTab === 'vocab'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Kamus ({discoveredIds.size})</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('quiz')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              openTab === 'quiz'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Kuis</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {openTab === 'zones' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Jelajahi 3 zona tematik, dekati objek lalu tekan <strong>E</strong> atau klik objeknya
              untuk mencatat kosakata berharakat.
            </p>
            {zoneProgress.map(({ zoneId, info, found, total, done }) => {
              const pct = Math.round((found / total) * 100);
              return (
                <div
                  key={zoneId}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">{info.subtitle}</p>
                      <h3 className="text-sm font-bold text-slate-900">{info.id}</h3>
                      <p dir="rtl" lang="ar" className="font-arabic text-base font-bold text-blue-700">
                        {info.arabic}
                      </p>
                    </div>
                    {done && <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          done ? 'bg-emerald-600' : 'bg-blue-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 tabular-nums">
                      {found}/{total}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onChangeQuizZone(zoneId);
                      onChangeTab('quiz');
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
                  >
                    Latihan Kuis {info.id}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {openTab === 'vocab' && (
          <div className="space-y-3">
            {/* Zone filter pills */}
            <div className="flex flex-wrap gap-1">
              {(['all', ...ZONE_LIST] as const).map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setVocabZoneFilter(z)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    vocabZoneFilter === z
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {z === 'all' ? 'Semua (18)' : ZONE_INFO[z].id}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredVocab.map((item) => {
                const isFound = discoveredIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectItem(item)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{item.indonesian}</span>
                        {isFound && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <span
                          dir="rtl"
                          lang="ar"
                          className="font-arabic text-lg font-bold text-slate-900"
                        >
                          {item.arabic}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate font-medium text-blue-700">
                          {item.transliteration}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => speakArabic(item.arabic)}
                      className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                      aria-label={`Lafalkan ${item.indonesian}`}
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {openTab === 'quiz' && (
          <div className="space-y-3.5">
            {/* Zone Selector + Harakat Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select
                value={quizZoneFilter}
                onChange={(e) => onChangeQuizZone(e.target.value as ZoneId | 'all')}
                aria-label="Filter zona kuis"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="all">Semua Zona (18 kata)</option>
                <option value="madrasah">Al-Madrasah (6 kata)</option>
                <option value="suq">Suq al-Fawakih (6 kata)</option>
                <option value="bayt">Al-Bayt (6 kata)</option>
              </select>

              <button
                type="button"
                onClick={() => setShowHarakat((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors ${
                  showHarakat
                    ? 'border-blue-200 bg-blue-50 text-blue-800'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}
                title="Latihan membaca Arab dengan atau tanpa harakat"
              >
                {showHarakat ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>{showHarakat ? 'Harakat: Aktif' : 'Tanpa Harakat'}</span>
              </button>
            </div>

            {/* Question Card */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-center">
              {quizQ.promptType === 'ar-to-id' && (
                <>
                  <p className="text-xs font-medium text-slate-500">
                    Pilih arti Bahasa Indonesia yang tepat:
                  </p>
                  <p
                    dir="rtl"
                    lang="ar"
                    className="mt-2 font-arabic text-4xl font-bold text-slate-900 py-1"
                  >
                    {formatArabic(quizQ.target.arabic)}
                  </p>
                  {showHarakat && (
                    <p className="mt-1 text-xs font-semibold text-blue-700">
                      {quizQ.target.transliteration}
                    </p>
                  )}
                </>
              )}

              {quizQ.promptType === 'id-to-ar' && (
                <>
                  <p className="text-xs font-medium text-slate-500">
                    Pilih kosakata Arab yang tepat untuk:
                  </p>
                  <p className="mt-2 font-display text-2xl font-extrabold text-slate-900">
                    {quizQ.target.indonesian}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{ZONE_INFO[quizQ.target.zone].id}</p>
                </>
              )}

              {quizQ.promptType === 'audio-to-id' && (
                <>
                  <p className="text-xs font-medium text-slate-500">
                    Dengarkan audio / lihat petunjuk, lalu pilih artinya:
                  </p>
                  <p
                    dir="rtl"
                    lang="ar"
                    className="mt-2 font-arabic text-3xl font-bold text-slate-900 py-1"
                  >
                    {formatArabic(quizQ.target.arabic)}
                  </p>
                </>
              )}

              <button
                type="button"
                onClick={handlePlayQuizAudio}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-100"
              >
                <Volume2 className="h-3.5 w-3.5 text-blue-600" />
                <span>Dengarkan (TTS)</span>
              </button>

              {ttsHint && <p className="mt-2 text-[11px] text-amber-700">{ttsHint}</p>}
            </div>

            {/* Multiple Choice Options */}
            <div className="space-y-2">
              {quizQ.options.map((opt) => {
                const isSelected = selectedOptionId === opt.id;
                const isCorrect = opt.id === quizQ.target.id;
                let style = 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50';
                if (selectedOptionId !== null) {
                  if (isCorrect) {
                    style = 'border-emerald-500 bg-emerald-50 text-emerald-900';
                  } else if (isSelected) {
                    style = 'border-red-400 bg-red-50 text-red-900';
                  } else {
                    style = 'border-slate-200 bg-white text-slate-400';
                  }
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleAnswer(opt.id)}
                    disabled={selectedOptionId !== null}
                    className={`w-full rounded-xl border px-4 py-2.5 transition-colors flex items-center justify-between ${style}`}
                  >
                    {quizQ.promptType === 'id-to-ar' ? (
                      <>
                        <span className="text-xs font-medium text-slate-500">
                          {selectedOptionId !== null ? opt.indonesian : ''}
                        </span>
                        <span dir="rtl" lang="ar" className="font-arabic text-2xl font-bold">
                          {formatArabic(opt.arabic)}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-semibold">{opt.indonesian}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedOptionId !== null && (
              <div className="space-y-2.5">
                <div
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    selectedOptionId === quizQ.target.id
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {selectedOptionId === quizQ.target.id
                    ? `Mumtāz! Benar (+30 poin). ${quizQ.target.arabic} = ${quizQ.target.indonesian}.`
                    : `Kurang tepat. Jawaban benar: ${quizQ.target.arabic} (${quizQ.target.transliteration}) = ${quizQ.target.indonesian}.`}
                </div>
                <button
                  type="button"
                  onClick={handleNextQuestion}
                  className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  Soal Berikutnya
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
