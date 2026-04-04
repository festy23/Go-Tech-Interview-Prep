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
import "./App.css";

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
  const [activeQuizId, setActiveQuizId] = useState<1 | 2 | 3 | null>(null);
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
    setQuizQuestions([]);
  }, []);

  const openBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId);
    setScreen("block");
  }, []);

  const startQuiz = useCallback((quizId: 1 | 2 | 3) => {
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

  const handleQuizComplete = useCallback(
    (quizId: 1 | 2 | 3, score: number, total: number) => {
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

  if (screen === "quiz" && activeQuizId) {
    if (quizLoading) {
      return (
        <div className="quiz-container" style={{ textAlign: "center", paddingTop: 80 }}>
          <LanguageSwitcher />
          <p style={{ color: "#8b949e" }}>{t("quiz.loading", "Loading...")}</p>
        </div>
      );
    }

    if (quizQuestions.length === 0) {
      return (
        <div className="quiz-container" style={{ textAlign: "center", paddingTop: 80 }}>
          <LanguageSwitcher />
          <p style={{ color: "#8b949e" }}>{t("quiz.noQuestions", "No questions available.")}</p>
          <button className="btn-home" onClick={goHome} style={{ marginTop: 16 }}>
            {t("quiz.home")}
          </button>
        </div>
      );
    }

    return (
      <>
        <LanguageSwitcher />
        <Quiz
          title={t(`quizCard.${activeQuizId}.title`)}
          questions={quizQuestions}
          onHome={goHome}
          onComplete={(s, total) => handleQuizComplete(activeQuizId, s, total)}
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
        />
      </>
    );
  }

  return <Home onOpenBlock={openBlock} onStartQuiz={startQuiz} />;
}
