import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import type { BlockDTO } from "@quiz/shared";
import type { ProgressMap } from "./data/progress";

const difficultyStyles: Record<string, string> = {
  basic: "bg-emerald-400/10 text-emerald-400",
  "basic-intermediate": "bg-sky-400/10 text-sky-400",
  intermediate: "bg-amber-400/10 text-amber-400",
  "intermediate-advanced": "bg-violet-400/10 text-violet-400",
  advanced: "bg-rose-400/10 text-rose-400",
};

interface SubQuizListProps {
  parentBlock: BlockDTO;
  subBlocks: BlockDTO[];
  progress: ProgressMap;
  onSelectSubQuiz: (block: BlockDTO) => void;
  onBack: () => void;
  onOpenArticle?: (blockId: string) => void;
}

export function SubQuizList({
  parentBlock,
  subBlocks,
  progress,
  onSelectSubQuiz,
  onBack,
  onOpenArticle,
}: SubQuizListProps) {
  const { t } = useTranslation();

  const completed = useMemo(
    () =>
      subBlocks.filter((b) => {
        const e = progress[b.id];
        return e && e.total > 0 && e.score / e.total >= 0.6;
      }).length,
    [subBlocks, progress],
  );

  return (
    <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up">
      <header className="flex items-center gap-3 py-3 mb-6">
        <button
          className="bg-transparent border-none text-carbon-300 text-sm font-sans cursor-pointer py-1.5 px-0 transition-all duration-200 tracking-[0.2px] hover:text-carbon-100"
          onClick={onBack}
        >
          {t("block.back")}
        </button>
        <span className="text-carbon-600">—</span>
        <h1 className="text-carbon-100 font-bold text-base">{parentBlock.title}</h1>
      </header>

      <div className="flex flex-col gap-3 mb-8">
        {subBlocks.map((block) => {
          const entry = progress[block.id];
          const done = entry && entry.total > 0 && entry.score / entry.total >= 0.6;
          const started = entry && entry.total > 0 && !done;

          return (
            <button
              key={block.id}
              className="group flex items-center gap-4 w-full bg-carbon-800 border border-white/5 rounded-[14px] p-[16px_20px] text-left cursor-pointer relative overflow-hidden transition-all duration-200 hover:-translate-y-[2px] hover:border-white/10 hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] max-[480px]:p-[14px_16px]"
              onClick={() => onSelectSubQuiz(block)}
            >
              <div
                className="shrink-0 w-[3px] self-stretch rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-200"
                style={{ backgroundColor: block.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-carbon-100 mb-0.5 truncate">
                  {block.title}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "text-[10px] font-bold font-mono px-2 py-[2px] rounded-full uppercase tracking-[0.5px]",
                      difficultyStyles[block.difficulty],
                    )}
                  >
                    {t(`difficulty.${block.difficulty}`)}
                  </span>
                  <span className="text-xs text-carbon-400 font-mono">
                    {block.topicCount} {t("subquiz.questions")}
                  </span>
                </div>
              </div>
              {done ? (
                <span className="text-emerald-400 text-sm font-semibold font-mono shrink-0">
                  ✓ {entry!.score}/{entry!.total}
                </span>
              ) : started ? (
                <span className="text-amber-400 text-sm font-semibold font-mono shrink-0">
                  ◑ {entry!.score}/{entry!.total}
                </span>
              ) : (
                <span className="text-carbon-500 text-xs font-mono shrink-0">
                  {t("subquiz.notStarted")}
                </span>
              )}
              {onOpenArticle && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenArticle(block.id);
                  }}
                  className="shrink-0 text-xs font-sans text-teal-400 bg-teal-400/8 border border-teal-400/20 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-teal-400/15 transition-colors [@media(pointer:coarse)]:min-h-8"
                >
                  {t("article.theory")}
                </button>
              )}
              <span className="text-carbon-500 group-hover:text-carbon-200 transition-colors text-lg leading-none ml-1">
                ›
              </span>
            </button>
          );
        })}
      </div>

      <div className="text-sm text-carbon-400 font-mono text-center border-t border-white/4 pt-5">
        {t("subquiz.progress", { n: completed, m: subBlocks.length })}
      </div>
    </div>
  );
}
