import { X, Check } from "lucide-react";
import { useRef, useState, useEffect } from "react";

type Props = {
  timeLabel: string;
  bars?: number[];          // values 0..1
  onCancel: () => void;
  onConfirm: () => void;
};

export default function RecordingBar({
  timeLabel,
  bars,
  onCancel,
  onConfirm,
}: Props) {
  // 🎯 DYNAMIC: Calculate bar count based on container width
  const containerRef = useRef<HTMLDivElement>(null);
  const [barCount, setBarCount] = useState(90); // Default fallback

  useEffect(() => {
    const calculateBarCount = () => {
      // Use a fixed optimal number of bars for good visualization
      const optimalBarCount = 150;
      setBarCount(optimalBarCount);
    };
    
    calculateBarCount();
  }, []);

  const fallback = Array.from({ length: barCount }, (_, i) => (Math.sin(i / 6) + 1) / 2);

  return (
    <div
      ref={containerRef}
      className="
        w-full
        py-4
        flex items-center gap-4
      "
      style={{
        position: 'relative',
      }}
    >
      {/* dotted baseline */}
      <div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px"
        style={{
          opacity: 0.3,
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 2px, transparent 2px 6px)',
        }}
      />

      {/* Cancel */}
      <button
        aria-label="Cancel"
        onClick={onCancel}
        className="grid place-items-center w-8 h-8 rounded-full bg-white text-gray-900 ring-1 ring-black/5 shadow hover:opacity-90 active:scale-95 transition"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Bars */}
        <div
        className="relative h-8 flex items-end gap-[2px] overflow-hidden justify-end"
        style={{ willChange: 'height, transform' }}
        >
        {(bars ?? fallback).slice(-barCount).map((v, i) => {
            const vv = Math.max(0, Math.min(1, v ?? 0));
            // Always show a minimum height (continuous baseline)
            // Small values → 2-4px baseline, peaks grow up to ~28px
            const minHeight = 2;
            const maxHeight = 28;
            const h = Math.round(minHeight + vv * (maxHeight - minHeight));
            return (
            <span
                key={i}
                className="
                w-[2px]
                rounded-[1px]
                bg-gradient-to-t from-white/70 to-white/90
                "
                style={{
                height: `${h}px`,
                opacity: 0.72 + (i % 5) * 0.05,          // subtle depth
                transform: `scaleY(${0.98 + (i % 7) * 0.01})`, // micro ripple
                }}
            />
            );
        })}
        </div>

      {/* Time */}
      <span className="font-mono text-sm tabular-nums text-white/90 min-w-[3.5ch] text-right">
        {timeLabel}
      </span>

      {/* Confirm */}
      <button
        aria-label="Confirm"
        onClick={onConfirm}
        className="grid place-items-center w-8 h-8 rounded-full bg-white text-gray-900 ring-1 ring-black/5 shadow hover:opacity-90 active:scale-95 transition"
      >
        <Check className="w-4 h-4" />
      </button>
    </div>
  );
}