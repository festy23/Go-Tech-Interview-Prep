import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RoadmapGraph } from "./RoadmapGraph";
import { GRAPH_EDGES } from "./data/blocks";
import type { RoadmapBlock } from "./data/blocks";
import { loadProgress } from "./data/progress";
import { fetchBlocks } from "./api/client";
import type { BlockDTO } from "@quiz/shared";

function blockDtoToRoadmapBlock(dto: BlockDTO): RoadmapBlock {
  return {
    id: dto.id,
    title: dto.title,
    difficulty: dto.difficulty,
    topicCount: dto.topicCount,
    topics: dto.topics,
    quizId: dto.quizId ?? undefined,
    gridRow: dto.gridRow,
    gridCol: dto.gridCol,
    color: dto.color,
  };
}

interface HomeProps {
  onOpenBlock: (blockId: string) => void;
  onStartQuiz: (quizId: 1 | 2 | 3) => void;
}

export function Home({ onOpenBlock, onStartQuiz }: HomeProps) {
  const { t, i18n } = useTranslation();
  const progress = useMemo(() => loadProgress(), []);

  const [blocks, setBlocks] = useState<RoadmapBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBlocks()
      .then((dtos) => {
        if (!cancelled) setBlocks(dtos.map(blockDtoToRoadmapBlock));
      })
      .catch((err) => console.error("[Home] Failed to fetch blocks:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [i18n.language]);

  // Derive quiz cards from blocks that have a quizId
  const quizCards = useMemo(
    () =>
      blocks
        .filter((b): b is RoadmapBlock & { quizId: 1 | 2 | 3 } => b.quizId != null)
        .map((b) => ({ id: b.quizId, count: b.topicCount, color: b.color })),
    [blocks],
  );

  if (loading) {
    return (
      <div className="home-container" style={{ textAlign: "center", paddingTop: 80 }}>
        <LanguageSwitcher />
        <p style={{ color: "#8b949e" }}>{t("home.loading", "Loading...")}</p>
      </div>
    );
  }

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
          blocks={blocks}
          edges={GRAPH_EDGES}
          progress={progress}
          onOpenBlock={onOpenBlock}
        />
      </section>

      <section className="practice-section">
        <div className="section-title">{t("home.quizzes")}</div>
        <div className="quiz-cards">
          {quizCards.map((q) => {
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
