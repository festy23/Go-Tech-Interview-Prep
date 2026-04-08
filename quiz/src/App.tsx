import { useState } from "react";
import { Home } from "./Home";
import { Quiz } from "./Quiz";
import { BlockDetail } from "./BlockDetail";
import { questions } from "./data/questions";
import { questions2 } from "./data/questions2";
import { questions3 } from "./data/questions3";
import { saveBlockProgress } from "./data/progress";
import { QUIZ_TO_BLOCK } from "./data/blocks";
import "./App.css";

type Screen = "home" | "quiz1" | "quiz2" | "quiz3" | "block";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const goHome = () => setScreen("home");

  const openBlock = (blockId: string) => {
    setSelectedBlockId(blockId);
    setScreen("block");
  };

  const startQuiz = (quizId: 1 | 2 | 3) => {
    setScreen(`quiz${quizId}` as Screen);
  };

  const handleQuizComplete = (quizId: 1 | 2 | 3, score: number, total: number) => {
    const blockId = QUIZ_TO_BLOCK[quizId];
    if (blockId) {
      saveBlockProgress({
        blockId,
        score,
        total,
        completedAt: new Date().toISOString(),
      });
    }
  };

  if (screen === "quiz1") {
    return (
      <Quiz
        title="Go на собесе"
        questions={questions}
        onHome={goHome}
        onComplete={(s, t) => handleQuizComplete(1, s, t)}
      />
    );
  }

  if (screen === "quiz2") {
    return (
      <Quiz
        title="Go Deep Dive"
        questions={questions2}
        onHome={goHome}
        onComplete={(s, t) => handleQuizComplete(2, s, t)}
      />
    );
  }

  if (screen === "quiz3") {
    return (
      <Quiz
        title="Go Concurrency"
        questions={questions3}
        onHome={goHome}
        onComplete={(s, t) => handleQuizComplete(3, s, t)}
      />
    );
  }

  if (screen === "block" && selectedBlockId) {
    return (
      <BlockDetail
        blockId={selectedBlockId}
        onHome={goHome}
        onStartQuiz={startQuiz}
      />
    );
  }

  return <Home onOpenBlock={openBlock} onStartQuiz={startQuiz} />;
}
