import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { CodeBlock } from "./CodeBlock";
import type { Question } from "./data/questions";

type AnswerState = {
  selected: number | null;
  isCorrect: boolean | null;
};

const gradeColors: Record<string, string> = {
  "grade-excellent": "text-emerald-400",
  "grade-good": "text-sky-400",
  "grade-ok": "text-amber-400",
  "grade-weak": "text-rose-400",
};

const optionBase =
  "flex items-start gap-3.5 w-full px-5 py-4 bg-carbon-850 border-[1.5px] border-white/5 rounded-[10px] text-carbon-100 text-[15px] font-sans leading-normal text-left cursor-pointer transition-all duration-200 hover:enabled:border-teal-400/30 hover:enabled:bg-teal-400/4 hover:enabled:shadow-[0_1px_3px_rgba(0,0,0,0.3)] disabled:cursor-default max-[480px]:text-sm max-[480px]:p-[14px_16px] max-[480px]:min-h-11 [@media(pointer:coarse)]:min-h-12";

interface QuizProps {
  title: string;
  questions: Question[];
  onHome: () => void;
  onComplete?: (score: number, total: number) => void;
}

export function Quiz({ title, questions, onHome, onComplete }: QuizProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answer, setAnswer] = useState<AnswerState>({ selected: null, isCorrect: null });
  const [finished, setFinished] = useState(false);

  const current = questions[currentIndex];
  const letters = ["A", "B", "C", "D"] as const;

  const handleSelect = useCallback(
    (i: number) => {
      if (answer.selected !== null) return;
      const isCorrect = i === current.correct;
      setAnswer({ selected: i, isCorrect });
      if (isCorrect) setScore((s) => s + 1);
    },
    [answer.selected, current.correct]
  );

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      onComplete?.(score, questions.length);
      setFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setAnswer({ selected: null, isCorrect: null });
    }
  }, [currentIndex, questions.length]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setScore(0);
    setAnswer({ selected: null, isCorrect: null });
    setFinished(false);
  }, []);

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    const grade =
      pct >= 90 ? t("quiz.gradeExcellent") :
      pct >= 70 ? t("quiz.gradeGood") :
      pct >= 50 ? t("quiz.gradeOk") : t("quiz.gradeWeak");
    const gradeClass =
      pct >= 90 ? "grade-excellent" :
      pct >= 70 ? "grade-good" :
      pct >= 50 ? "grade-ok" : "grade-weak";
    const icon = pct >= 70 ? "✅" : pct >= 50 ? "💡" : "📚";

    return (
      <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up max-[480px]:px-3.5">
        <div className="bg-carbon-750 border border-white/5 rounded-2xl p-[52px_36px] text-center my-auto shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02),0_1px_3px_rgba(0,0,0,0.4)] animate-fade-slide-up max-[480px]:p-[40px_20px]">
          <div className="text-[52px] mb-[18px] block">{icon}</div>
          <h1 className="text-5xl font-extrabold text-carbon-100 mb-1.5 font-sans tracking-[-2px] max-[480px]:text-[40px]">{score} / {questions.length}</h1>
          <div className="text-lg text-carbon-300 mb-3 font-mono">{t("quiz.percentCorrect", { pct })}</div>
          <div className={clsx("text-[22px] font-bold mb-7 font-sans tracking-[-0.3px]", gradeColors[gradeClass])}>{grade}</div>
          <div className="h-1.5 bg-carbon-800 rounded-[10px] overflow-hidden mb-9">
            <div className="h-full bg-[linear-gradient(90deg,#FB7185,#FBBF24,#34D399)] bg-[length:200%_100%] animate-gradient-slide rounded-[10px] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-3.5 justify-center max-[480px]:flex-col max-[480px]:gap-2.5">
            <button className="py-3.5 px-11 bg-teal-400 text-carbon-950 text-base font-bold font-sans border-none rounded-xl cursor-pointer transition-all duration-200 tracking-[0.3px] hover:-translate-y-0.5 hover:bg-teal-500 hover:shadow-[0_4px_16px_rgba(45,212,191,0.2)] max-[480px]:w-full max-[480px]:text-center max-[480px]:min-h-12 [@media(pointer:coarse)]:min-h-12" onClick={handleRestart}>{t("quiz.tryAgain")}</button>
            <button className="py-3.5 px-8 bg-white/4 text-carbon-100 text-base font-semibold font-sans border border-white/6 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/7 hover:border-white/12 hover:-translate-y-px max-[480px]:w-full max-[480px]:text-center max-[480px]:min-h-12 [@media(pointer:coarse)]:min-h-12" onClick={onHome}>{t("quiz.home")}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up max-[480px]:px-3.5">
      <header className="flex justify-between items-center py-3 mb-2">
        <button className="bg-transparent border-none text-carbon-300 text-sm font-sans cursor-pointer py-1.5 px-0 transition-all duration-200 tracking-[0.2px] hover:text-carbon-100" onClick={onHome}>{t("quiz.back")}</button>
        <div className="text-xl font-bold text-carbon-100 tracking-[-0.3px] font-sans">{title}</div>
        <div className="text-lg font-semibold font-mono">
          <span className="text-emerald-400">{score}</span>
          <span className="text-carbon-400 mx-[3px]">/</span>
          <span className="text-carbon-300">{questions.length}</span>
        </div>
      </header>

      <div className="h-1 bg-carbon-800 rounded-[10px] overflow-hidden mb-4 relative">
        <div
          className="h-full bg-teal-400 rounded-[10px] transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] relative"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="text-center text-[13px] text-carbon-300 mb-5 font-mono tracking-[1px]">
        {currentIndex + 1} / {questions.length}
      </div>

      <div className="bg-carbon-750 border border-white/5 rounded-[14px] p-[36px_28px] flex-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02),0_1px_3px_rgba(0,0,0,0.4)] animate-fade-slide-up [animation-delay:0.1s] max-[480px]:p-[28px_20px]">
        <h2 className="text-lg font-semibold leading-[1.55] text-carbon-100 mb-6 tracking-[-0.2px] max-[480px]:text-base">{current.question}</h2>

        {current.code && (
          <CodeBlock code={current.code} />
        )}

        <div className="flex flex-col gap-3">
          {current.options.map((opt, i) => {
            const isCorrectAnswer = answer.selected !== null && i === current.correct;
            const isWrongAnswer = answer.selected !== null && i === answer.selected && i !== current.correct;
            const isDimmed = answer.selected !== null && i !== current.correct && i !== answer.selected;

            return (
              <button
                key={i}
                className={clsx(
                  optionBase,
                  isCorrectAnswer && "!border-emerald-400 !bg-emerald-400/7 shadow-[0_1px_3px_rgba(0,0,0,0.3)]",
                  isWrongAnswer && "!border-rose-400 !bg-rose-400/7 shadow-[0_1px_3px_rgba(0,0,0,0.3)]",
                  isDimmed && "opacity-35",
                )}
                onClick={() => handleSelect(i)}
                disabled={answer.selected !== null}
              >
                <span className={clsx(
                  "shrink-0 w-7 h-7 flex items-center justify-center rounded-full font-bold text-xs font-mono bg-white/4 text-carbon-300 mt-px transition-all duration-200",
                  isCorrectAnswer && "!bg-emerald-400 !text-carbon-950 scale-110",
                  isWrongAnswer && "!bg-rose-400 !text-white scale-110",
                )}>
                  {letters[i]}
                </span>
                <span className="pt-[3px]">{opt}</span>
              </button>
            );
          })}
        </div>

        {answer.selected !== null && (
          <div className={clsx(
            "mt-[22px] p-[20px_22px] rounded-[14px] text-sm leading-[1.65] animate-slide-up",
            answer.isCorrect
              ? "bg-emerald-400/7 border border-emerald-400/20"
              : "bg-rose-400/7 border border-rose-400/20"
          )}>
            <div className={clsx("font-bold text-[15px] mb-2 font-sans", answer.isCorrect ? "text-emerald-400" : "text-rose-400")}>
              {answer.isCorrect ? t("quiz.correct") : t("quiz.wrong")}
            </div>
            <p className="text-carbon-300">{current.explanation}</p>
            <button className="mt-[18px] py-3 px-9 bg-teal-400 text-carbon-950 text-[15px] font-bold font-sans border-none rounded-xl cursor-pointer transition-all duration-200 tracking-[0.3px] hover:-translate-y-0.5 hover:bg-teal-500 hover:shadow-[0_4px_16px_rgba(45,212,191,0.2)] max-[480px]:w-full max-[480px]:min-h-12 [@media(pointer:coarse)]:min-h-12" onClick={handleNext}>
              {currentIndex + 1 >= questions.length ? t("quiz.results") : t("quiz.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
