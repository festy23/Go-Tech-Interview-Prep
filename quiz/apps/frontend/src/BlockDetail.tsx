import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { fetchBlock } from "./api/client";
import { loadProgress, getProgressPct } from "./data/progress";
import { CircularProgress } from "./CircularProgress";
import type { BlockDTO } from "@quiz/shared";

const difficultyStyles: Record<string, string> = {
  basic: "bg-emerald-400/10 text-emerald-400",
  "basic-intermediate": "bg-sky-400/10 text-sky-400",
  intermediate: "bg-amber-400/10 text-amber-400",
  "intermediate-advanced": "bg-violet-400/10 text-violet-400",
  advanced: "bg-rose-400/10 text-rose-400",
};

interface BlockDetailProps {
  blockId: string;
  onHome: () => void;
  onStartQuiz: (quizId: number, title: string) => void;
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
      <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up">
        <button className="bg-transparent border-none text-carbon-300 text-sm font-sans cursor-pointer py-1.5 px-0 transition-all duration-200 tracking-[0.2px] hover:text-carbon-100" onClick={onHome}>{t("block.back")}</button>
        <p style={{ color: "#78788A", marginTop: 24 }}>{t("home.loading", "Loading...")}</p>
      </div>
    );
  }

  if (error || !block) {
    return (
      <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up">
        <button className="bg-transparent border-none text-carbon-300 text-sm font-sans cursor-pointer py-1.5 px-0 transition-all duration-200 tracking-[0.2px] hover:text-carbon-100" onClick={onHome}>{t("block.back")}</button>
        <p style={{ color: "#78788A", marginTop: 24 }}>{t("block.notFound")}</p>
      </div>
    );
  }

  const progress = loadProgress();
  const pct = getProgressPct(progress, block.id);
  const entry = progress[block.id];

  return (
    <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up">
      <header className="flex items-center gap-3 py-3 mb-6">
        <button className="bg-transparent border-none text-carbon-300 text-sm font-sans cursor-pointer py-1.5 px-0 transition-all duration-200 tracking-[0.2px] hover:text-carbon-100" onClick={onHome}>{t("block.back")}</button>
        <span
          className={clsx(
            "text-[9px] font-bold font-mono px-2 py-[3px] rounded-full uppercase tracking-[0.5px] whitespace-nowrap shrink-0 transition-all duration-200",
            difficultyStyles[block.difficulty]
          )}
          style={{ fontSize: 11, padding: "3px 9px" }}
        >
          {t(`difficulty.${block.difficulty}`)}
        </span>
      </header>

      <div
        className="flex items-center gap-6 bg-carbon-800 border border-white/6 rounded-2xl p-[32px_28px] mb-8 relative overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_4px_24px_rgba(0,0,0,0.5),0_1px_3px_rgba(0,0,0,0.3)] animate-fade-slide-up [animation-delay:0.1s] before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--block-color,#2DD4BF)] before:shadow-[0_0_16px_var(--block-color,#2DD4BF)] after:content-[''] after:absolute after:inset-0 after:bg-[radial-gradient(ellipse_at_100%_0%,rgba(45,212,191,0.03),transparent_60%)] after:pointer-events-none max-[480px]:flex-col max-[480px]:text-center max-[480px]:p-[24px_20px]"
        style={{ "--block-color": block.color } as React.CSSProperties}
      >
        <div className="flex-1 min-w-0 relative z-[1]">
          <h1 className="text-2xl font-extrabold text-carbon-100 mb-2.5 tracking-[-0.5px]">{block.title}</h1>
          <div className="text-[13px] text-carbon-400 flex items-center gap-3 flex-wrap font-mono max-[480px]:justify-center">
            <span>~{block.topicCount} {t("block.questions")}</span>
            {entry && (
              <span className="text-[13px] font-semibold" style={{ color: block.color }}>
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

      <h2 className="font-mono text-[11px] font-bold text-carbon-400 uppercase tracking-[1.2px] mb-3 flex items-center gap-3.5 after:content-[''] after:flex-1 after:h-px after:bg-white/4">{t("block.topics")}</h2>
      <div className="flex flex-wrap gap-2.5 mb-7 animate-fade-slide-up [animation-delay:0.15s]">
        {block.topics.map((topic) => (
          <span key={topic} className="text-[13px] font-sans text-carbon-200 bg-carbon-800 border border-white/6 rounded-[10px] px-4 py-2 cursor-default transition-all duration-200 hover:bg-carbon-750 hover:border-teal-400/25 hover:text-teal-400 hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(45,212,191,0.06)]">{topic}</span>
        ))}
      </div>

      {block.quizId ? (
        <button
          className="block w-full py-[18px] px-8 bg-linear-to-br from-teal-400 to-teal-700 text-carbon-950 text-base font-bold font-sans border-none rounded-[14px] cursor-pointer text-center tracking-[0.3px] relative overflow-hidden transition-all duration-200 animate-fade-slide-up [animation-delay:0.25s] hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(45,212,191,0.2)] after:content-['_→'] after:inline-block after:transition-transform after:duration-200 hover:after:animate-arrow-bounce"
          onClick={() => onStartQuiz(block.quizId!, block.title)}
        >
          {t("block.startQuiz")}
        </button>
      ) : onStartBlockQuiz ? (
        <button
          className="block w-full py-[18px] px-8 bg-linear-to-br from-teal-400 to-teal-700 text-carbon-950 text-base font-bold font-sans border-none rounded-[14px] cursor-pointer text-center tracking-[0.3px] relative overflow-hidden transition-all duration-200 animate-fade-slide-up [animation-delay:0.25s] hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(45,212,191,0.2)] after:content-['_→'] after:inline-block after:transition-transform after:duration-200 hover:after:animate-arrow-bounce"
          onClick={() => onStartBlockQuiz(block.id, block.title)}
        >
          {t("block.startQuiz")}
        </button>
      ) : (
        <button className="block w-full py-[18px] px-8 bg-carbon-800 text-carbon-400 text-base font-semibold font-sans border border-white/5 rounded-[14px] cursor-not-allowed text-center animate-fade-slide-up [animation-delay:0.25s]" disabled>
          {t("block.inDevelopment")}
        </button>
      )}
    </div>
  );
}
