import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fetchBlock } from "./api/client";
import { loadProgress, getProgressPct } from "./data/progress";
import { CircularProgress } from "./CircularProgress";
import type { BlockDTO } from "@quiz/shared";

interface BlockDetailProps {
  blockId: string;
  onHome: () => void;
  onStartQuiz: (quizId: 1 | 2 | 3) => void;
  onStartBlockQuiz?: (blockId: string, title: string) => void;
}

export function BlockDetail({ blockId, onHome, onStartQuiz, onStartBlockQuiz }: BlockDetailProps) {
  const { t, i18n } = useTranslation();
  const [block, setBlock] = useState<BlockDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchBlock(blockId)
      .then((dto) => { if (!cancelled) setBlock(dto); })
      .catch((err) => {
        console.error("[BlockDetail] Failed to fetch block:", err);
        if (!cancelled) setError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [blockId, i18n.language]);

  if (loading) {
    return (
      <div className="block-detail-container">
        <button className="btn-back" onClick={onHome}>{t("block.back")}</button>
        <p style={{ color: "#8b949e", marginTop: 24 }}>{t("home.loading", "Loading...")}</p>
      </div>
    );
  }

  if (error || !block) {
    return (
      <div className="block-detail-container">
        <button className="btn-back" onClick={onHome}>{t("block.back")}</button>
        <p style={{ color: "#8b949e", marginTop: 24 }}>{t("block.notFound")}</p>
      </div>
    );
  }

  const progress = loadProgress();
  const pct = getProgressPct(progress, block.id);
  const entry = progress[block.id];

  return (
    <div className="block-detail-container">
      <header className="block-detail-header">
        <button className="btn-back" onClick={onHome}>{t("block.back")}</button>
        <span
          className={`difficulty-badge difficulty-${block.difficulty}`}
          style={{ fontSize: 11, padding: "3px 9px" }}
        >
          {t(`difficulty.${block.difficulty}`)}
        </span>
      </header>

      <div className="block-detail-hero" style={{ "--block-color": block.color } as React.CSSProperties}>
        <div className="block-detail-info">
          <h1 className="block-detail-title">{block.title}</h1>
          <div className="block-detail-meta">
            <span>~{block.topicCount} {t("block.questions")}</span>
            {entry && (
              <span className="block-detail-score" style={{ color: block.color }}>
                {t("block.bestScore")} {entry.score}/{entry.total}
              </span>
            )}
          </div>
        </div>
        <CircularProgress
          pct={pct}
          size={72}
          strokeWidth={5}
          color={block.color}
          showLabel={true}
        />
      </div>

      <h2 className="section-title" style={{ marginBottom: 12 }}>{t("block.topics")}</h2>
      <div className="block-topics-grid">
        {block.topics.map((topic) => (
          <span key={topic} className="block-topic-tag">{topic}</span>
        ))}
      </div>

      {block.quizId ? (
        <button
          className="btn-start-quiz"
          onClick={() => onStartQuiz(block.quizId!)}
        >
          {t("block.startQuiz")}
        </button>
      ) : onStartBlockQuiz ? (
        <button
          className="btn-start-quiz"
          onClick={() => onStartBlockQuiz(block.id, block.title)}
        >
          {t("block.startQuiz")}
        </button>
      ) : (
        <button className="btn-coming-soon" disabled>
          {t("block.inDevelopment")}
        </button>
      )}
    </div>
  );
}
