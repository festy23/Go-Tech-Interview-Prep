import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Home } from "./Home";
import { Quiz } from "./Quiz";
import { SubQuizList } from "./SubQuizList";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AuthProvider } from "./auth/AuthContext";
import { HeaderAuth } from "./auth/HeaderAuth";
import { ProgressProvider, useProgress } from "./data/ProgressContext";

const Playground = lazy(() =>
  import("./Playground").then((m) => ({ default: m.Playground }))
);
import type { Question } from "./data/questions";
import { fetchQuestions, fetchBlocks } from "./api/client";
import { QUIZ_TO_BLOCK } from "./data/blocks";
import type { QuestionDTO, BlockDTO } from "@quiz/shared";

type Screen = "home" | "subquiz-list" | "quiz" | "playground";

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
  const { progress, recordProgress } = useProgress();
  const [screen, setScreen] = useState<Screen>("home");

  // All blocks — used for subquiz-list and blockQuizMap
  const [allBlocks, setAllBlocks] = useState<BlockDTO[]>([]);
  const [blockQuizMap, setBlockQuizMap] = useState<Record<number, string>>(QUIZ_TO_BLOCK);

  // SubQuizList state
  const [selectedParentBlockId, setSelectedParentBlockId] = useState<string | null>(null);

  // Playground state
  const [playgroundCode, setPlaygroundCode] = useState<string>("");

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

  const openPlayground = useCallback((code?: string) => {
    setPlaygroundCode(code ?? "");
    setScreen("playground");
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

    fetchQuestions({ quizId, shuffle: true })
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

    fetchQuestions({ blockId, shuffle: true })
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
      const blockId = blockQuizMap[quizId] ?? `quiz${quizId}`;
      recordProgress(blockId, score, total, quizId);
    },
    [blockQuizMap, recordProgress],
  );

  // ── Playground screen ────────────────────────────────────────────────────────
  if (screen === "playground") {
    return (
      <>

        <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-carbon-400">Loading...</div>}>
          <Playground code={playgroundCode} onHome={goHome} />
        </Suspense>
      </>
    );
  }

  // ── Quiz screen ──────────────────────────────────────────────────────────────
  if (screen === "quiz" && (activeQuizId || activeBlockId)) {
    if (quizLoading) {
      return (
        <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up" style={{ textAlign: "center", paddingTop: 80 }}>
  
          <p style={{ color: "#78788A" }}>{t("quiz.loading", "Loading...")}</p>
        </div>
      );
    }

    if (quizQuestions.length === 0) {
      return (
        <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up" style={{ textAlign: "center", paddingTop: 80 }}>
  
          <p style={{ color: "#78788A" }}>{t("quiz.noQuestions", "No questions available.")}</p>
          <button className="py-3.5 px-8 bg-white/4 text-carbon-100 text-base font-semibold font-sans border border-white/6 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/7 hover:border-white/12 hover:-translate-y-px" onClick={goHome} style={{ marginTop: 16 }}>
            {t("quiz.home")}
          </button>
        </div>
      );
    }

    return (
      <>

        <Quiz
          title={quizTitle}
          questions={quizQuestions}
          onHome={goHome}
          onOpenInPlayground={openPlayground}
          onComplete={(s, total) => {
            if (activeQuizId) {
              handleQuizComplete(activeQuizId, s, total);
            } else if (activeBlockId) {
              recordProgress(activeBlockId, s, total, null);
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
  
          <p style={{ color: "#78788A" }}>{t("block.notFound")}</p>
          <button className="py-3.5 px-8 bg-white/4 text-carbon-100 text-base font-semibold font-sans border border-white/6 rounded-xl cursor-pointer mt-4" onClick={goHome}>
            {t("quiz.home")}
          </button>
        </div>
      );
    }

    return (
      <>

        <SubQuizList
          parentBlock={parentBlock}
          subBlocks={subBlocks}
          progress={progress}
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
      onOpenPlayground={openPlayground}
      childrenByParent={childrenByParent}
    />
  );
}

/** Root wrapper with auth + progress providers */
export function AppWithAuth() {
  return (
    <AuthProvider>
      <ProgressProvider>
        <HeaderAuth />
        <LanguageSwitcher />
        <App />
      </ProgressProvider>
    </AuthProvider>
  );
}
