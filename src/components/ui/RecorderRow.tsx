import { X, Check } from "lucide-react";

type Props = {
  timeLabel?: string;
  bars?: number[];           // 0..1 values; if not given we fake a smooth idle
  onCancel?: () => void;
  onConfirm?: () => void;
};

export default function RecorderRow({
  timeLabel = "0:16",
  bars,
  onCancel,
  onConfirm,
}: Props) {
  // Make lots of slender bars
  const BAR_COUNT = 120;
  const fallback = Array.from({ length: BAR_COUNT }, (_, i) =>
    0.5 + 0.5 * Math.sin(i / 7)         // gentle motion if no live data
  );

  const values = (bars?.length ? bars : fallback).slice(0, BAR_COUNT);

  return (
    <div
      className="
        w-full max-w-5xl
        rounded-xl
        bg-neutral-800/60
        ring-1 ring-white/10
        shadow-[inset_0_1px_0_rgba(255,255,255,.06)]
        px-4 py-3
        flex items-center gap-3
      "
    >
      {/* Cancel (white circle) */}
      <button
        aria-label="Cancel"
        onClick={onCancel}
        className="
          grid place-items-center
          size-8 rounded-full
          bg-white text-gray-900
          ring-1 ring-black/5 shadow
          hover:bg-gray-50 active:scale-95 transition
        "
      >
        <X className="w-4 h-4" />
      </button>

      {/* Wave area with centered dotted baseline */}
      <div className="relative flex-1 flex items-center">
        {/* dotted baseline */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 2px, transparent 2px 6px)",
          }}
        />

        {/* bars */}
        <div className="relative mx-2 h-6 flex items-end gap-[2px]">
          {values.map((v, i) => {
            const h = Math.max(2, Math.min(22, Math.round(v * 22))); // 2..22px
            return (
              <span
                key={i}
                className="w-[1px] bg-white/90"
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>
      </div>

      {/* Timer (mono, subtle) */}
      <span className="font-mono text-[13px] tabular-nums text-white/90 min-w-[3.5ch] text-right">
        {timeLabel}
      </span>

      {/* Confirm (white circle) */}
      <button
        aria-label="Confirm"
        onClick={onConfirm}
        className="
          grid place-items-center
          size-8 rounded-full
          bg-white text-gray-900
          ring-1 ring-black/5 shadow
          hover:bg-gray-50 active:scale-95 transition
        "
      >
        <Check className="w-4 h-4" />
      </button>
    </div>
  );
}