import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoadmapBlock, GraphEdge } from "./data/blocks";
import type { ProgressMap } from "./data/progress";
import { getProgressPct } from "./data/progress";
import { CircularProgress } from "./CircularProgress";

interface LineData {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface RoadmapGraphProps {
  blocks: RoadmapBlock[];
  edges: GraphEdge[];
  progress: ProgressMap;
  onOpenBlock: (blockId: string) => void;
}

const GRID_ROWS = 5;
const GRID_COLS = 4;

export function RoadmapGraph({ blocks, edges, progress, onOpenBlock }: RoadmapGraphProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [lines, setLines] = useState<LineData[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recalculate = () => {
      const containerRect = container.getBoundingClientRect();
      const newLines: LineData[] = [];

      for (const edge of edges) {
        const fromEl = nodeRefs.current[edge.from];
        const toEl = nodeRefs.current[edge.to];
        if (!fromEl || !toEl) continue;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();

        newLines.push({
          key: `${edge.from}-${edge.to}`,
          x1: fromRect.left + fromRect.width / 2 - containerRect.left,
          y1: fromRect.bottom - containerRect.top,
          x2: toRect.left + toRect.width / 2 - containerRect.left,
          y2: toRect.top - containerRect.top,
        });
      }
      setLines(newLines);
    };

    recalculate();

    const observer = new ResizeObserver(recalculate);
    observer.observe(container);
    return () => observer.disconnect();
  }, [edges]);

  // Build a lookup by grid slot index
  const blockBySlot: Record<number, RoadmapBlock> = {};
  for (const block of blocks) {
    const slot = (block.gridRow - 1) * GRID_COLS + (block.gridCol - 1);
    blockBySlot[slot] = block;
  }

  const totalSlots = GRID_ROWS * GRID_COLS;

  return (
    <div className="roadmap-graph-container" ref={containerRef}>
      <div className="roadmap-grid">
        {Array.from({ length: totalSlots }, (_, i) => {
          const block = blockBySlot[i];
          if (!block) return <div key={i} />;

          const pct = getProgressPct(progress, block.id);
          return (
            <button
              key={block.id}
              ref={(el) => { nodeRefs.current[block.id] = el; }}
              className="roadmap-node"
              style={{ "--node-color": block.color } as React.CSSProperties}
              onClick={() => onOpenBlock(block.id)}
            >
              <div className="roadmap-node-header">
                <span className="roadmap-node-title">{block.title}</span>
                <CircularProgress
                  pct={pct}
                  size={36}
                  strokeWidth={3}
                  color={block.color}
                  showLabel={true}
                />
              </div>
              <div>
                <span
                  className={`difficulty-badge difficulty-${block.difficulty}`}
                >
                  {t(`difficulty.${block.difficulty}`)}
                </span>
              </div>
              <div className="roadmap-node-footer">
                <span className="roadmap-node-footer-count">
                  ~{block.topicCount} {t("roadmap.questions")}
                </span>
                {block.quizId && (
                  <span style={{ color: "#3fb950", fontSize: 10 }}>{t("roadmap.quizAvailable")}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <svg className="roadmap-svg-overlay" aria-hidden="true">
        <defs>
          <marker
            id="roadmap-arrow"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#30363d" />
          </marker>
        </defs>
        {lines.map((l) => (
          <path
            key={l.key}
            d={`M ${l.x1} ${l.y1} C ${l.x1} ${l.y1 + 28} ${l.x2} ${l.y2 - 28} ${l.x2} ${l.y2}`}
            stroke="#30363d"
            strokeWidth="1.5"
            fill="none"
            markerEnd="url(#roadmap-arrow)"
          />
        ))}
      </svg>
    </div>
  );
}
