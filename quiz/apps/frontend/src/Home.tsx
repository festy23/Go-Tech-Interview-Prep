import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RoadmapGraph } from "./RoadmapGraph";
import { ROADMAP_BLOCKS, GRAPH_EDGES } from "./data/blocks";
import { loadProgress } from "./data/progress";

interface QuizCardData {
  id: 1 | 2 | 3;
  count: number;
  color: string;
}

const QUIZ_CARDS_DATA: QuizCardData[] = [
  { id: 1, count: 50, color: "#58a6ff" },
  { id: 2, count: 50, color: "#3fb950" },
  { id: 3, count: 50, color: "#d29922" },
];

interface HomeProps {
  onOpenBlock: (blockId: string) => void;
  onStartQuiz: (quizId: 1 | 2 | 3) => void;
}

export function Home({ onOpenBlock, onStartQuiz }: HomeProps) {
  const { t } = useTranslation();
  const progress = useMemo(() => loadProgress(), []);

  return (
    <div className="home-container">
      <LanguageSwitcher />
      <div className="home-header">
        <div className="home-logo">Go</div>
        <h1 className="home-title">Middle Interview Prep</h1>
        <p className="home-subtitle">{t("home.tagline")}</p>
      </div>

      <section className="roadmap-section">
        <div className="section-title">{t("home.roadmap")}</div>
        <RoadmapGraph
          blocks={ROADMAP_BLOCKS}
          edges={GRAPH_EDGES}
          progress={progress}
          onOpenBlock={onOpenBlock}
        />
      </section>

      <section className="practice-section">
        <div className="section-title">{t("home.quizzes")}</div>
        <div className="quiz-cards">
          {QUIZ_CARDS_DATA.map((q) => {
            const title = t(`quizCard.${q.id}.title`);
            const subtitle = t(`quizCard.${q.id}.subtitle`);
            const topics = t(`quizCard.${q.id}.topics`).split(",");

            return (
              <button
                key={q.id}
                className="quiz-card"
                onClick={() => onStartQuiz(q.id)}
                style={{ "--card-color": q.color } as React.CSSProperties}
              >
                <div className="quiz-card-top">
                  <div className="quiz-card-num" style={{ color: q.color }}>
                    #{q.id}
                  </div>
                  <div className="quiz-card-count">{q.count} {t("home.questions")}</div>
                </div>
                <div className="quiz-card-title">{title}</div>
                <div className="quiz-card-subtitle">{subtitle}</div>
                <div className="quiz-card-topics">
                  {topics.map((topic) => (
                    <span key={topic} className="topic-tag">{topic}</span>
                  ))}
                </div>
                <div className="quiz-card-cta" style={{ color: q.color }}>
                  {t("home.start")}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
