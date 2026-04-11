import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RoadmapGraph } from "./RoadmapGraph";
import { GRAPH_EDGES } from "./data/blocks";
import type { RoadmapBlock } from "./data/blocks";
import { getProgressPct, getSubQuizProgress } from "./data/progress";
import { useProgress } from "./data/ProgressContext";
import { fetchBlocks } from "./api/client";
import type { BlockDTO } from "@quiz/shared";

function blockDtoToRoadmapBlock(dto: BlockDTO): RoadmapBlock {
  return {
    id: dto.id,
    title: dto.title,
    subtitle: dto.subtitle,
    difficulty: dto.difficulty,
    topicCount: dto.topicCount,
    topics: dto.topics,
    quizId: dto.quizId ?? undefined,
    gridRow: dto.gridRow,
    gridCol: dto.gridCol,
    color: dto.color,
    parentBlockId: dto.parentBlockId,
  };
}

interface HomeProps {
  onOpenBlock: (blockId: string) => void;
  onStartQuiz: (quizId: number, title: string) => void;
  onOpenPlayground?: () => void;
  onOpenArticle?: (blockId: string) => void;
  childrenByParent: Record<string, BlockDTO[]>;
}

export function Home({ onOpenBlock, onStartQuiz, onOpenPlayground, onOpenArticle, childrenByParent }: HomeProps) {
  const { t, i18n } = useTranslation();
  const { progress } = useProgress();

  const [blocks, setBlocks] = useState<RoadmapBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBlocks()
      .then((dtos) => {
        if (!cancelled) setBlocks(dtos.filter((d) => !d.parentBlockId).map(blockDtoToRoadmapBlock));
      })
      .catch((err) => console.error("[Home] Failed to fetch blocks:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [i18n.language]);

  // Cards = top-level blocks that either have a quizId OR have sub-quizzes
  const quizCards = useMemo(
    () => blocks.filter((b) => b.quizId != null || childrenByParent[b.id]?.length > 0),
    [blocks, childrenByParent],
  );

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 pb-15 pt-10 min-h-screen flex flex-col animate-fade-slide-up" style={{ textAlign: "center", paddingTop: 80 }}>
        <p style={{ color: "#78788A" }}>{t("home.loading", "Loading...")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 pb-15 pt-10 min-h-screen flex flex-col animate-fade-slide-up">

      <div className="flex gap-15 items-start min-h-[500px] mb-15 max-[768px]:flex-col max-[768px]:gap-8 max-[768px]:min-h-auto max-[768px]:mb-10">
        <div className="flex-[0_0_380px] pt-15 max-[768px]:flex-none max-[768px]:pt-5 max-[768px]:w-full">
          <div className="text-left mb-0 animate-fade-slide-up [animation-delay:0.05s] max-[768px]:text-center">
            <h1 className="text-4xl font-extrabold text-carbon-100 tracking-[-0.8px] mb-3.5 leading-[1.15] max-[480px]:text-2xl">{t("home.title", "Go Interview Prep")}</h1>
            <p className="text-[15px] text-carbon-300 leading-relaxed max-w-[340px] max-[768px]:max-w-none">{t("home.tagline")}</p>
            {onOpenPlayground && (
              <button
                onClick={() => onOpenPlayground()}
                className="mt-5 inline-flex items-center gap-2 bg-teal-400/10 text-teal-400 hover:bg-teal-400/20 font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors border border-teal-400/20 [@media(pointer:coarse)]:min-h-12"
              >
                <span className="text-base">▶</span> {t("home.playground")}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 flex justify-center max-[768px]:w-full">
          <section className="mb-0 animate-fade-slide-up [animation-delay:0.1s]">
            <div className="font-mono text-[11px] font-bold text-carbon-400 uppercase tracking-[1.2px] mb-5 flex items-center gap-3.5 after:content-[''] after:flex-1 after:h-px after:bg-white/4">{t("home.roadmap")}</div>
            <RoadmapGraph
              blocks={blocks}
              edges={GRAPH_EDGES}
              progress={progress}
              onOpenBlock={onOpenBlock}
            />
          </section>
        </div>
      </div>

      <section className="mb-13 animate-fade-slide-up [animation-delay:0.2s]">
        <div className="font-mono text-[11px] font-bold text-carbon-400 uppercase tracking-[1.2px] mb-5 flex items-center gap-3.5 after:content-[''] after:flex-1 after:h-px after:bg-white/4">{t("home.quizzes")}</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[18px] max-[768px]:grid-cols-1">
          {quizCards.map((q) => {
            const children = childrenByParent[q.id];
            const isParent = children && children.length > 0;

            // Progress display
            let progressLabel: string | null = null;
            if (isParent) {
              const { completed, total } = getSubQuizProgress(
                children.map((c) => c.id),
                progress,
              );
              progressLabel = `${completed}/${total} ${t("home.subquizzes")}`;
            } else if (q.quizId) {
              const pct = getProgressPct(progress, q.id);
              if (pct > 0) progressLabel = `${pct}%`;
            }

            return (
              <button
                key={q.id}
                className="group flex flex-col gap-2.5 w-full bg-carbon-750 border border-white/5 rounded-[14px] p-[0_24px_22px] text-left cursor-pointer relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02),0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[3px] hover:border-white/8 hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),0_12px_28px_rgba(0,0,0,0.3)] before:content-[''] before:block before:h-0.5 before:bg-[linear-gradient(90deg,var(--card-color,#2DD4BF),transparent_70%)] before:mx-[-24px] before:mb-[18px] before:opacity-60 hover:before:opacity-100 max-[480px]:p-[0_18px_18px]"
                onClick={() => {
                  if (isParent) {
                    onOpenBlock(q.id);
                  } else if (q.quizId) {
                    onStartQuiz(q.quizId, q.title);
                  }
                }}
                style={{ "--card-color": q.color } as React.CSSProperties}
              >
                <div className="flex justify-between items-center">
                  <div className="text-[13px] font-bold font-mono tracking-[0.5px]" style={{ color: q.color }}>
                    {isParent ? "●" : `#${q.quizId}`}
                  </div>
                  <div className="text-xs font-mono text-carbon-300 bg-white/4 px-3 py-1 rounded-full">
                    {isParent
                      ? `${children.length} ${t("home.subquizzes")}`
                      : `${q.topicCount} ${t("home.questions")}`}
                  </div>
                </div>
                <div className="text-xl font-bold text-carbon-100 tracking-[-0.3px] max-[480px]:text-lg">{q.title}</div>
                <div className="text-[13px] text-carbon-300 leading-normal">{q.subtitle}</div>
                <div className="flex flex-wrap gap-[7px] mt-1.5">
                  {q.topics.map((topic) => (
                    <span key={topic} className="text-xs font-sans text-carbon-300 bg-white/4 border-none rounded-full px-[11px] py-1 transition-all duration-200 hover:bg-teal-400/8 hover:text-teal-400">{topic}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <div className="text-sm font-semibold tracking-[0.3px] transition-[letter-spacing] duration-200 group-hover:tracking-[1px]" style={{ color: q.color }}>
                    {t("home.start")}
                  </div>
                  <div className="flex items-center gap-2">
                    {onOpenArticle && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenArticle(q.id);
                        }}
                        className="text-xs font-sans text-carbon-400 hover:text-teal-400 transition-colors cursor-pointer"
                      >
                        {t("article.overview")}
                      </button>
                    )}
                    {progressLabel && (
                      <div className="text-xs font-mono text-carbon-400">{progressLabel}</div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
