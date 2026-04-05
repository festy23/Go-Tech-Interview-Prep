import { useRef, useEffect, useState } from "react";
import type { RoadmapBlock, GraphEdge } from "./data/blocks";
import type { ProgressMap } from "./data/progress";  // kept for interface contract
import './roadmap-nodes.css'

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
const GRID_COLS = 3;

export function RoadmapGraph({ blocks, edges, onOpenBlock }: RoadmapGraphProps) {
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

  // Build a lookup by grid slot index (using 3-column grid)
  const blockBySlot: Record<number, RoadmapBlock> = {};
  for (const block of blocks) {
    const slot = (block.gridRow - 1) * GRID_COLS + (block.gridCol - 1);
    blockBySlot[slot] = block;
  }

  const totalSlots = GRID_ROWS * GRID_COLS;

  return (
    <div className="relative" ref={containerRef}>
      <div className="grid grid-cols-3 gap-[48px_24px] justify-items-center max-[600px]:grid-cols-2 max-[600px]:gap-[32px_12px]">
        {Array.from({ length: totalSlots }, (_, i) => {
          const block = blockBySlot[i];
          if (!block) return <div key={i} />;

          return (
            <button
              key={block.id}
              ref={(el) => { nodeRefs.current[block.id] = el; }}
              className="roadmap-node relative z-[1] flex items-center justify-center rounded-xl px-5 py-3 text-center cursor-pointer min-w-[120px] max-w-[200px] border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:scale-[1.03] max-[600px]:min-w-[100px] max-[600px]:max-w-[160px] max-[600px]:px-3 max-[600px]:py-2.5"
              style={{ "--node-color": block.color } as React.CSSProperties}
              onClick={() => onOpenBlock(block.id)}
            >
              <span className="text-[13px] font-semibold text-carbon-100 leading-snug text-center tracking-[0.15px] max-[600px]:text-[11px]">{block.title}</span>
            </button>
          );
        })}
      </div>

      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible z-0" aria-hidden="true">
        <defs>
          <marker
            id="roadmap-dot"
            markerWidth="6"
            markerHeight="6"
            refX="3"
            refY="3"
            orient="auto"
          >
            <circle cx="3" cy="3" r="2" fill="rgba(255,255,255,0.2)" />
          </marker>
        </defs>
        {lines.map((l) => {
          const dy = l.y2 - l.y1;
          const cp = Math.min(dy * 0.4, 40);
          return (
            <path
              key={l.key}
              d={`M ${l.x1} ${l.y1} C ${l.x1} ${l.y1 + cp} ${l.x2} ${l.y2 - cp} ${l.x2} ${l.y2}`}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
              strokeDasharray="4 4"
              fill="none"
              markerEnd="url(#roadmap-dot)"
            />
          );
        })}
      </svg>
    </div>
  );
}
