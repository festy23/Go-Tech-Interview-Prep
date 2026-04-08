import { useState, useCallback } from "react";
import type { Question } from "./data/questions";

type AnswerState = {
  selected: number | null;
  isCorrect: boolean | null;
};

interface QuizProps {
  title: string;
  questions: Question[];
  onHome: () => void;
  onComplete?: (score: number, total: number) => void;
}

export function Quiz({ title, questions, onHome, onComplete }: QuizProps) {
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
      pct >= 90 ? "Senior-ready!" :
      pct >= 70 ? "Strong Middle" :
      pct >= 50 ? "Middle" : "Keep studying!";
    const gradeClass =
      pct >= 90 ? "grade-excellent" :
      pct >= 70 ? "grade-good" :
      pct >= 50 ? "grade-ok" : "grade-weak";
    const icon = pct >= 70 ? "✅" : pct >= 50 ? "💡" : "📚";

    return (
      <div className="quiz-container">
        <div className="result-card">
          <div className="result-icon">{icon}</div>
          <h1>{score} / {questions.length}</h1>
          <div className="result-pct">{pct}% correct</div>
          <div className={`result-grade ${gradeClass}`}>{grade}</div>
          <div className="result-bar-track">
            <div className="result-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="result-actions">
            <button className="btn-restart" onClick={handleRestart}>Try Again</button>
            <button className="btn-home" onClick={onHome}>Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-container">
      <header className="quiz-header">
        <button className="btn-back" onClick={onHome}>← Back</button>
        <div className="quiz-title">{title}</div>
        <div className="quiz-score">
          <span className="score-correct">{score}</span>
          <span className="score-sep">/</span>
          <span className="score-total">{questions.length}</span>
        </div>
      </header>

      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="question-counter">
        {currentIndex + 1} / {questions.length}
      </div>

      <div className="question-card">
        <h2 className="question-text">{current.question}</h2>

        {current.code && (
          <pre className="question-code"><code>{current.code}</code></pre>
        )}

        <div className="options">
          {current.options.map((opt, i) => {
            let cls = "option-btn";
            if (answer.selected !== null) {
              if (i === current.correct) cls += " correct";
              else if (i === answer.selected) cls += " wrong";
              else cls += " dimmed";
            }
            return (
              <button
                key={i}
                className={cls}
                onClick={() => handleSelect(i)}
                disabled={answer.selected !== null}
              >
                <span className="option-letter">{letters[i]}</span>
                <span className="option-text">{opt}</span>
              </button>
            );
          })}
        </div>

        {answer.selected !== null && (
          <div className={`explanation ${answer.isCorrect ? "explanation-correct" : "explanation-wrong"}`}>
            <div className="explanation-header">
              {answer.isCorrect ? "Верно!" : "Неверно!"}
            </div>
            <p>{current.explanation}</p>
            <button className="btn-next" onClick={handleNext}>
              {currentIndex + 1 >= questions.length ? "Результаты" : "Далее →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
