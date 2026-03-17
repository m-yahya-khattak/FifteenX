"use client";

import { useEffect, useRef } from "react";

interface PnLChartProps {
  data: Array<{ timestamp: number; pnl: number }>;
  height?: number;
}

export default function PnLChart({ data, height = 200 }: PnLChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const h = canvas.height;
    const padding = 20;

    // Clear canvas
    ctx.clearRect(0, 0, width, h);

    // Draw background
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, width, h);

    if (data.length < 2) {
      ctx.fillStyle = "#71717a";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Not enough data", width / 2, h / 2);
      return;
    }

    // Find min/max PnL
    const pnls = data.map((d) => d.pnl);
    const minPnL = Math.min(...pnls, 0);
    const maxPnL = Math.max(...pnls, 0);
    const range = maxPnL - minPnL || 1;

    // Draw zero line
    const zeroY = minPnL < 0 ? h - padding - ((0 - minPnL) / range) * (h - 2 * padding) : h - padding;
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, zeroY);
    ctx.lineTo(width - padding, zeroY);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (i / 5) * (h - 2 * padding);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw P&L line
    ctx.strokeStyle = data[data.length - 1].pnl >= 0 ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const plotWidth = width - 2 * padding;
    const plotHeight = h - 2 * padding;

    data.forEach((point, index) => {
      const x = padding + (index / (data.length - 1)) * plotWidth;
      const y = padding + ((maxPnL - point.pnl) / range) * plotHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Fill area under curve
    ctx.fillStyle = data[data.length - 1].pnl >= 0 
      ? "rgba(34, 197, 94, 0.1)" 
      : "rgba(239, 68, 68, 0.1)";
    ctx.beginPath();
    ctx.moveTo(padding, zeroY);
    data.forEach((point, index) => {
      const x = padding + (index / (data.length - 1)) * plotWidth;
      const y = padding + ((maxPnL - point.pnl) / range) * plotHeight;
      if (index === 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo(width - padding, zeroY);
    ctx.closePath();
    ctx.fill();

    // Draw labels
    ctx.fillStyle = "#71717a";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`$${maxPnL.toFixed(0)}`, padding - 5, padding + 5);
    ctx.fillText(`$${minPnL.toFixed(0)}`, padding - 5, h - padding);
    ctx.fillText("$0", padding - 5, zeroY + 3);
  }, [data, height]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={height}
      className="w-full rounded-lg"
    />
  );
}

