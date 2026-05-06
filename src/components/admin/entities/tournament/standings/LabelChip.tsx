'use client';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function LabelChip({
  name,
  color,
  onRemove,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
}) {
  return (
    <span
      style={{
        backgroundColor: hexToRgba(color, 0.15),
        border: `1px solid ${hexToRgba(color, 0.35)}`,
        color: color,
      }}
      className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[0.7rem] font-mono uppercase tracking-wide leading-none whitespace-nowrap"
      title={name}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 opacity-70 hover:opacity-100 transition-opacity leading-none"
          aria-label={`Quitar etiqueta ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
