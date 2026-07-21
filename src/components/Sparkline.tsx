interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  stroke?: string;
  fill?: string;
  className?: string;
}

export function Sparkline({ data, width = 120, height = 32, color, stroke, fill, className }: Props) {
  const strokeColor = stroke ?? color ?? "var(--color-primary)";
  if (!data || data.length === 0) return <svg width={width} height={height} className={className} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / Math.max(1, data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill && <polygon points={areaPoints} fill={fill} opacity={0.15} />}
      <polyline fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}
