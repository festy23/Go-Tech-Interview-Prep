import { useMemo } from "react";
import { RoadmapGraph } from "./RoadmapGraph";
import { ROADMAP_BLOCKS, GRAPH_EDGES } from "./data/blocks";
import { loadProgress } from "./data/progress";

interface QuizCard {
  id: 1 | 2 | 3;
  title: string;
  subtitle: string;
  topics: string[];
  count: number;
  color: string;
}

const QUIZ_CARDS: QuizCard[] = [
  {
    id: 1,
    title: "Go на собесе",
    subtitle: "По материалам Максима Лукьянова",
    topics: ["gRPC / REST", "ООП в Go", "Строки", "Context", "Slice / Map", "Каналы", "Горутины", "Планировщик GMP", "ACID / PostgreSQL", "Kafka"],
    count: 50,
    color: "#58a6ff",
  },
  {
    id: 2,
    title: "Go Deep Dive",
    subtitle: "Углублённые темы для Middle",
    topics: ["Указатели", "Слайсы (глубоко)", "Map (глубоко)", "Структуры", "Интерфейсы", "Ошибки / defer / recover"],
    count: 50,
    color: "#3fb950",
  },
  {
    id: 3,
    title: "Go Concurrency",
    subtitle: "Каналы, sync, code review",
    topics: ["Каналы", "Паттерны каналов", "Mutex / RWMutex", "WaitGroup / Once", "sync/atomic", "Code Review"],
    count: 50,
    color: "#d29922",
  },
];

interface HomeProps {
  onOpenBlock: (blockId: string) => void;
  onStartQuiz: (quizId: 1 | 2 | 3) => void;
}

export function Home({ onOpenBlock, onStartQuiz }: HomeProps) {
  const progress = useMemo(() => loadProgress(), []);

  return (
    <div className="home-container">
      <div className="home-header">
        <div className="home-logo">Go</div>
        <h1 className="home-title">Middle Interview Prep</h1>
        <p className="home-subtitle">Дорожная карта подготовки к собеседованию</p>
      </div>

      <section className="roadmap-section">
        <div className="section-title">Дорожная карта</div>
        <RoadmapGraph
          blocks={ROADMAP_BLOCKS}
          edges={GRAPH_EDGES}
          progress={progress}
          onOpenBlock={onOpenBlock}
        />
      </section>

      <section className="practice-section">
        <div className="section-title">Практика — квизы</div>
        <div className="quiz-cards">
          {QUIZ_CARDS.map((q) => (
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
                <div className="quiz-card-count">{q.count} вопросов</div>
              </div>
              <div className="quiz-card-title">{q.title}</div>
              <div className="quiz-card-subtitle">{q.subtitle}</div>
              <div className="quiz-card-topics">
                {q.topics.map((t) => (
                  <span key={t} className="topic-tag">{t}</span>
                ))}
              </div>
              <div className="quiz-card-cta" style={{ color: q.color }}>
                Начать →
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
