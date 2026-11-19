import { useState } from 'react';
import { X, BarChart3, LineChart as LineIcon, PieChart as PieIcon } from 'lucide-react';

export type ChartType = 'column' | 'bar' | 'line' | 'pie';

export interface ChartItem {
  id: string;
  type: ChartType;
  title: string;
  labels: string[];
  series: { name: string; data: number[] }[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ChartOverlayProps {
  chart: ChartItem;
  onUpdate: (updated: ChartItem) => void;
  onDelete: (id: string) => void;
}

export function ChartOverlay({ chart, onUpdate, onDelete }: ChartOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.chart-controls')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - chart.x, y: e.clientY - chart.y });

    const onMove = (ev: MouseEvent) => {
      onUpdate({
        ...chart,
        x: Math.max(10, ev.clientX - dragStart.x),
        y: Math.max(10, ev.clientY - dragStart.y),
      });
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const chartColors = ['#2d8a4e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];

  // Calculate dimensions for SVG
  const padding = 40;
  const plotWidth = Math.max(100, chart.width - padding * 2);
  const plotHeight = Math.max(80, chart.height - padding * 2 - 30);

  // Flat data values
  const allValues = chart.series.flatMap(s => s.data);
  const maxVal = Math.max(1, ...allValues);
  const minVal = Math.min(0, ...allValues);
  const range = maxVal - minVal || 1;

  const renderChartContent = () => {
    if (chart.type === 'column') {
      const numGroups = chart.labels.length;
      const groupWidth = plotWidth / (numGroups || 1);
      const numSeries = chart.series.length;
      const barWidth = Math.max(4, (groupWidth * 0.7) / (numSeries || 1));

      return (
        <svg width="100%" height={plotHeight + 40} viewBox={`0 0 ${chart.width} ${chart.height - 30}`}>
          {/* Y Axis line */}
          <line x1={padding} y1={padding} x2={padding} y2={padding + plotHeight} stroke="#555" strokeWidth="1" />
          {/* X Axis line */}
          <line x1={padding} y1={padding + plotHeight} x2={padding + plotWidth} y2={padding + plotHeight} stroke="#555" strokeWidth="1" />

          {chart.labels.map((label, gIdx) => {
            const groupX = padding + gIdx * groupWidth + groupWidth * 0.15;
            return (
              <g key={gIdx}>
                {chart.series.map((s, sIdx) => {
                  const val = s.data[gIdx] ?? 0;
                  const barH = (val / range) * plotHeight;
                  const barX = groupX + sIdx * barWidth;
                  const barY = padding + plotHeight - barH;
                  return (
                    <rect
                      key={sIdx}
                      x={barX}
                      y={barY}
                      width={barWidth - 2}
                      height={Math.max(2, barH)}
                      fill={chartColors[sIdx % chartColors.length]}
                      rx="2"
                    >
                      <title>{`${s.name || label}: ${val}`}</title>
                    </rect>
                  );
                })}
                <text
                  x={groupX + (groupWidth * 0.7) / 2}
                  y={padding + plotHeight + 16}
                  fill="#aaa"
                  fontSize="11"
                  textAnchor="middle"
                >
                  {label.length > 8 ? `${label.slice(0, 7)}…` : label}
                </text>
              </g>
            );
          })}
        </svg>
      );
    }

    if (chart.type === 'line') {
      const numPoints = chart.labels.length;
      const stepX = plotWidth / Math.max(1, numPoints - 1);

      return (
        <svg width="100%" height={plotHeight + 40} viewBox={`0 0 ${chart.width} ${chart.height - 30}`}>
          <line x1={padding} y1={padding} x2={padding} y2={padding + plotHeight} stroke="#555" strokeWidth="1" />
          <line x1={padding} y1={padding + plotHeight} x2={padding + plotWidth} y2={padding + plotHeight} stroke="#555" strokeWidth="1" />

          {chart.series.map((s, sIdx) => {
            const points = s.data.map((val, i) => {
              const x = padding + i * stepX;
              const y = padding + plotHeight - ((val - minVal) / range) * plotHeight;
              return `${x},${y}`;
            }).join(' ');

            const color = chartColors[sIdx % chartColors.length];

            return (
              <g key={sIdx}>
                <polyline fill="none" stroke={color} strokeWidth="2.5" points={points} />
                {s.data.map((val, i) => {
                  const cx = padding + i * stepX;
                  const cy = padding + plotHeight - ((val - minVal) / range) * plotHeight;
                  return (
                    <circle key={i} cx={cx} cy={cy} r="3.5" fill={color}>
                      <title>{`${s.name || chart.labels[i]}: ${val}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}

          {chart.labels.map((label, i) => (
            <text
              key={i}
              x={padding + i * stepX}
              y={padding + plotHeight + 16}
              fill="#aaa"
              fontSize="11"
              textAnchor="middle"
            >
              {label.length > 8 ? `${label.slice(0, 7)}…` : label}
            </text>
          ))}
        </svg>
      );
    }

    if (chart.type === 'pie') {
      const dataSeries = chart.series[0]?.data ?? [];
      const sum = dataSeries.reduce((acc, curr) => acc + Math.max(0, curr), 0) || 1;
      const radius = Math.min(plotWidth, plotHeight) / 2;
      const cx = chart.width / 2;
      const cy = (chart.height - 30) / 2;

      let accumulatedAngle = 0;

      return (
        <svg width="100%" height={chart.height - 30} viewBox={`0 0 ${chart.width} ${chart.height - 30}`}>
          {dataSeries.map((val, idx) => {
            const angle = (Math.max(0, val) / sum) * 2 * Math.PI;
            const startAngle = accumulatedAngle;
            const endAngle = accumulatedAngle + angle;
            accumulatedAngle = endAngle;

            const x1 = cx + radius * Math.cos(startAngle);
            const y1 = cy + radius * Math.sin(startAngle);
            const x2 = cx + radius * Math.cos(endAngle);
            const y2 = cy + radius * Math.sin(endAngle);
            const largeArc = angle > Math.PI ? 1 : 0;

            const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

            return (
              <path
                key={idx}
                d={d}
                fill={chartColors[idx % chartColors.length]}
                stroke="#2a2a2a"
                strokeWidth="1.5"
              >
                <title>{`${chart.labels[idx] || `Item ${idx + 1}`}: ${val} (${Math.round((val / sum) * 100)}%)`}</title>
              </path>
            );
          })}
        </svg>
      );
    }

    return null;
  };

  return (
    <div
      className={`ss-chart-card ${isDragging ? 'dragging' : ''}`}
      style={{
        left: chart.x,
        top: chart.y,
        width: chart.width,
        height: chart.height,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="ss-chart-header">
        <strong className="ss-chart-title">{chart.title || 'Chart'}</strong>
        <div className="chart-controls">
          <button
            className={`ss-chart-type-btn ${chart.type === 'column' ? 'active' : ''}`}
            onClick={() => onUpdate({ ...chart, type: 'column' })}
            title="Column Chart"
          >
            <BarChart3 size={13} />
          </button>
          <button
            className={`ss-chart-type-btn ${chart.type === 'line' ? 'active' : ''}`}
            onClick={() => onUpdate({ ...chart, type: 'line' })}
            title="Line Chart"
          >
            <LineIcon size={13} />
          </button>
          <button
            className={`ss-chart-type-btn ${chart.type === 'pie' ? 'active' : ''}`}
            onClick={() => onUpdate({ ...chart, type: 'pie' })}
            title="Pie Chart"
          >
            <PieIcon size={13} />
          </button>
          <button
            className="ss-chart-close-btn"
            onClick={() => onDelete(chart.id)}
            title="Delete Chart"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="ss-chart-body">
        {renderChartContent()}
      </div>
    </div>
  );
}
