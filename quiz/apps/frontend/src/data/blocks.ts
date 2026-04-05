export type DifficultyLevel =
  | "basic"
  | "basic-intermediate"
  | "intermediate"
  | "intermediate-advanced"
  | "advanced";

export interface RoadmapBlock {
  id: string;
  title: string;
  difficulty: DifficultyLevel;
  topicCount: number;
  topics: string[];
  quizId?: 1 | 2 | 3 | 4;
  gridRow: number;
  gridCol: number;
  color: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

// UI layout edges — these represent relationships between blocks on the roadmap graph.
// They are not content data, so they stay hardcoded here.
export const GRAPH_EDGES: GraphEdge[] = [
  { from: "primitives", to: "oop" },
  { from: "primitives", to: "sql" },
  { from: "oop", to: "concurrency" },
  { from: "sql", to: "networks" },
  { from: "concurrency", to: "server" },
  { from: "networks", to: "server" },
  { from: "server", to: "sysdesign" },
];

// quiz id -> block id that it contributes progress to (fallback mapping).
// The authoritative mapping comes from BlockDTO.quizId fetched from the API.
export const QUIZ_TO_BLOCK: Record<number, string> = {
  3: "concurrency",
};
