import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Home } from "./Home";
import { Quiz } from "./Quiz";
import { BlockDetail } from "./BlockDetail";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Question } from "./data/questions";
import { saveBlockProgress } from "./data/progress";
import { saveProgress, fetchQuestions, fetchBlocks } from "./api/client";
import { getSessionId } from "./api/session";
import { QUIZ_TO_BLOCK } from "./data/blocks";
import type { QuestionDTO, BlockDTO } from "@quiz/shared";

type Screen = "home" | "quiz" | "block";

/** Map API QuestionDTO to the shape Quiz component expects */
function dtoToQuestion(dto: QuestionDTO): Question {
  return {
    id: typeof dto.id === "string" ? parseInt(dto.id, 10) || 0 : (dto.id as number),
    question: dto.question,
    code: dto.code,
    options: dto.options,
    correct: dto.correct,
    explanation: dto.explanation,
  };
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Quiz state
  const [activeQuizId, setActiveQuizId] = useState<1 | 2 | 3 | 4 | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState<string>("");
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);

  // Block-to-quiz mapping from API (supplement hardcoded QUIZ_TO_BLOCK)
  const [blockQuizMap, setBlockQuizMap] = useState<Record<number, string>>(QUIZ_TO_BLOCK);

  // Fetch block-quiz mapping once (and on language change) to keep QUIZ_TO_BLOCK up-to-date
  useEffect(() => {
    fetchBlocks()
      .then((dtos: BlockDTO[]) => {
        const map: Record<number, string> = { ...QUIZ_TO_BLOCK };
        for (const b of dtos) {
          if (b.quizId != null) map[b.quizId] = b.id;
        }
        setBlockQuizMap(map);
      })
      .catch((err) => console.warn("[App] Failed to fetch blocks for quiz mapping:", err));
  }, [i18n.language]);

  const goHome = useCallback(() => {
    setScreen("home");
    setActiveQuizId(null);
    setActiveBlockId(null);
    setQuizTitle("");
    setQuizQuestions([]);
  }, []);

  const openBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId);
    setScreen("block");
  }, []);

  const startQuiz = useCallback((quizId: 1 | 2 | 3 | 4) => {
    setActiveQuizId(quizId);
    setQuizLoading(true);
    setScreen("quiz");

    fetchQuestions({ quizId })
      .then((dtos) => setQuizQuestions(dtos.map(dtoToQuestion)))
      .catch((err) => {
        console.error("[App] Failed to fetch questions for quiz", quizId, err);
        setQuizQuestions([]);
      })
      .finally(() => setQuizLoading(false));
  }, []);

  const startBlockQuiz = useCallback((blockId: string, title: string) => {
    setActiveBlockId(blockId);
    setActiveQuizId(null);
    setQuizTitle(title);
    setQuizLoading(true);
    setScreen("quiz");

    fetchQuestions({ blockId })
      .then((dtos) => setQuizQuestions(dtos.map(dtoToQuestion)))
      .catch((err) => {
        console.error("[App] Failed to fetch questions for block", blockId, err);
        setQuizQuestions([]);
      })
      .finally(() => setQuizLoading(false));
  }, []);

  const handleQuizComplete = useCallback(
    (quizId: 1 | 2 | 3 | 4, score: number, total: number) => {
      const blockId = blockQuizMap[quizId] ?? null;

      // 1. Save to localStorage (instant, works offline)
      if (blockId) {
        saveBlockProgress({ blockId, score, total, completedAt: new Date().toISOString() });
      }

      // 2. Sync to backend (fire-and-forget — don't block the UI)
      saveProgress({
        sessionId: getSessionId(),
        blockId: blockId ?? `quiz${quizId}`,
        quizId,
        score,
        total,
      }).catch((err) => console.warn("[progress] Failed to sync to backend:", err));
    },
    [blockQuizMap],
  );

  if (screen === "quiz" && (activeQuizId || activeBlockId)) {
    if (quizLoading) {
      return (
        <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up" style={{ textAlign: "center", paddingTop: 80 }}>
          <LanguageSwitcher />
          <p style={{ color: "#78788A" }}>{t("quiz.loading", "Loading...")}</p>
        </div>
      );
    }

    if (quizQuestions.length === 0) {
      return (
        <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up" style={{ textAlign: "center", paddingTop: 80 }}>
          <LanguageSwitcher />
          <p style={{ color: "#78788A" }}>{t("quiz.noQuestions", "No questions available.")}</p>
          <button className="py-3.5 px-8 bg-white/4 text-carbon-100 text-base font-semibold font-sans border border-white/6 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/7 hover:border-white/12 hover:-translate-y-px" onClick={goHome} style={{ marginTop: 16 }}>
            {t("quiz.home")}
          </button>
        </div>
      );
    }

    return (
      <>
        <LanguageSwitcher />
        <Quiz
          title={activeQuizId ? t(`quizCard.${activeQuizId}.title`) : quizTitle}
          questions={quizQuestions}
          onHome={goHome}
          onComplete={(s, total) => {
            if (activeQuizId) {
              handleQuizComplete(activeQuizId, s, total);
            } else if (activeBlockId) {
              saveBlockProgress({ blockId: activeBlockId, score: s, total, completedAt: new Date().toISOString() });
              saveProgress({ sessionId: getSessionId(), blockId: activeBlockId, quizId: null as any, score: s, total })
                .catch((err) => console.warn("[progress] Failed to sync:", err));
            }
          }}
        />
      </>
    );
  }

  if (screen === "block" && selectedBlockId) {
    return (
      <>
        <LanguageSwitcher />
        <BlockDetail
          blockId={selectedBlockId}
          onHome={goHome}
          onStartQuiz={startQuiz}
          onStartBlockQuiz={startBlockQuiz}
        />
      </>
    );
  }

  return <Home onOpenBlock={openBlock} onStartQuiz={startQuiz} />;
}
