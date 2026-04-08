interface CircularProgressProps {
  pct: number;       // 0-100
  size: number;      // px
  strokeWidth: number;
  color: string;
  showLabel?: boolean;
}

export function CircularProgress({ pct, size, strokeWidth, color, showLabel = true }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(pct, 100) / 100);

  return (
    <div
      className="circular-progress-wrap"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#21262d"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={pct > 0 ? color : "transparent"}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {showLabel && (
        <span
          className="circular-progress-label"
          style={{ fontSize: Math.max(size * 0.22, 9) }}
        >
          {pct > 0 ? `${pct}%` : "—"}
        </span>
      )}
    </div>
  );
}
