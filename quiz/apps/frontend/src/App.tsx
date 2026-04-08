import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Home } from "./Home";
import { Quiz } from "./Quiz";
import { SubQuizList } from "./SubQuizList";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Question } from "./data/questions";
import { saveBlockProgress, loadProgress } from "./data/progress";
import { saveProgress, fetchQuestions, fetchBlocks } from "./api/client";
import { getSessionId } from "./api/session";
import { QUIZ_TO_BLOCK } from "./data/blocks";
import type { QuestionDTO, BlockDTO } from "@quiz/shared";

type Screen = "home" | "subquiz-list" | "quiz";

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

  // All blocks — used for subquiz-list and blockQuizMap
  const [allBlocks, setAllBlocks] = useState<BlockDTO[]>([]);
  const [blockQuizMap, setBlockQuizMap] = useState<Record<number, string>>(QUIZ_TO_BLOCK);

  // SubQuizList state
  const [selectedParentBlockId, setSelectedParentBlockId] = useState<string | null>(null);

  // Quiz state
  const [activeQuizId, setActiveQuizId] = useState<number | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState<string>("");
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);

  useEffect(() => {
    fetchBlocks()
      .then((dtos: BlockDTO[]) => {
        setAllBlocks(dtos);
        const map: Record<number, string> = { ...QUIZ_TO_BLOCK };
        for (const b of dtos) {
          if (b.quizId != null) map[b.quizId] = b.id;
        }
        setBlockQuizMap(map);
      })
      .catch((err) => console.warn("[App] Failed to fetch blocks:", err));
  }, [i18n.language]);

  // Derived: map parentBlockId → child blocks
  const childrenByParent = useMemo(() => {
    const map: Record<string, BlockDTO[]> = {};
    for (const b of allBlocks) {
      if (b.parentBlockId) {
        if (!map[b.parentBlockId]) map[b.parentBlockId] = [];
        map[b.parentBlockId].push(b);
      }
    }
    return map;
  }, [allBlocks]);

  const goHome = useCallback(() => {
    setScreen("home");
    setSelectedParentBlockId(null);
    setActiveQuizId(null);
    setActiveBlockId(null);
    setQuizTitle("");
    setQuizQuestions([]);
  }, []);

  const openSubQuizList = useCallback((parentBlockId: string) => {
    setSelectedParentBlockId(parentBlockId);
    setScreen("subquiz-list");
  }, []);

  const startQuiz = useCallback((quizId: number, title: string) => {
    setActiveQuizId(quizId);
    setActiveBlockId(null);
    setQuizTitle(title);
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

  // Called from SubQuizList when user selects a sub-quiz
  const handleSelectSubQuiz = useCallback(
    (block: BlockDTO) => {
      if (block.quizId) {
        startQuiz(block.quizId, block.title);
      } else {
        startBlockQuiz(block.id, block.title);
      }
    },
    [startQuiz, startBlockQuiz],
  );

  const handleQuizComplete = useCallback(
    (quizId: number, score: number, total: number) => {
      const blockId = blockQuizMap[quizId] ?? null;
      if (blockId) {
        saveBlockProgress({ blockId, score, total, completedAt: new Date().toISOString() });
      }
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

  // ── Quiz screen ──────────────────────────────────────────────────────────────
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
          title={quizTitle}
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

  // ── SubQuizList screen ────────────────────────────────────────────────────────
  if (screen === "subquiz-list" && selectedParentBlockId) {
    const parentBlock = allBlocks.find((b) => b.id === selectedParentBlockId);
    const subBlocks = childrenByParent[selectedParentBlockId] ?? [];

    if (!parentBlock) {
      return (
        <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up" style={{ textAlign: "center", paddingTop: 80 }}>
          <LanguageSwitcher />
          <p style={{ color: "#78788A" }}>{t("block.notFound")}</p>
          <button className="py-3.5 px-8 bg-white/4 text-carbon-100 text-base font-semibold font-sans border border-white/6 rounded-xl cursor-pointer mt-4" onClick={goHome}>
            {t("quiz.home")}
          </button>
        </div>
      );
    }

    return (
      <>
        <LanguageSwitcher />
        <SubQuizList
          parentBlock={parentBlock}
          subBlocks={subBlocks}
          progress={loadProgress()}
          onSelectSubQuiz={handleSelectSubQuiz}
          onBack={goHome}
        />
      </>
    );
  }

  // ── Home screen ───────────────────────────────────────────────────────────────
  return (
    <Home
      onOpenBlock={openSubQuizList}
      onStartQuiz={startQuiz}
      childrenByParent={childrenByParent}
    />
  );
}
