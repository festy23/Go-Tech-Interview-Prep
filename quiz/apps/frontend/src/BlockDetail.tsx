import { useTranslation } from "react-i18next";
import { ROADMAP_BLOCKS } from "./data/blocks";
import { loadProgress, getProgressPct } from "./data/progress";
import { CircularProgress } from "./CircularProgress";

interface BlockDetailProps {
  blockId: string;
  onHome: () => void;
  onStartQuiz: (quizId: 1 | 2 | 3) => void;
}

export function BlockDetail({ blockId, onHome, onStartQuiz }: BlockDetailProps) {
  const { t } = useTranslation();
  const block = ROADMAP_BLOCKS.find((b) => b.id === blockId);

  if (!block) {
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

      <div className="block-detail-hero">
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

      <div className="block-stub-notice">
        🚧 {t("block.comingSoon", { count: block.topicCount })}
      </div>

      {block.quizId ? (
        <button
          className="btn-start-quiz"
          onClick={() => onStartQuiz(block.quizId!)}
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
