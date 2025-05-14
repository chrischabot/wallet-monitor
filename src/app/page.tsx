'use client';

import React, { useEffect, useState } from 'react';

interface SparkTx {
  value: number;
  direction: 'in' | 'out';
  hash: string;
  timestamp: string;
}

interface Employee {
  address: string;
  balance: string;
  spark: SparkTx[];
  dailyBalances: { date: string; balance: string }[];
}

function getDayBinsWithTxs(spark: SparkTx[], days: number): { txs: SparkTx[], date: string }[] {
  // Get today in UTC, zeroed time
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  // Build bins for the last N days
  const bins: { txs: SparkTx[], date: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    bins.push({ txs: [], date: d.toISOString().slice(0, 10) });
  }
  // Place transactions into bins
  for (const tx of spark) {
    const txDate = new Date(Number(tx.timestamp) * 1000);
    txDate.setUTCHours(0, 0, 0, 0);
    const dateStr = txDate.toISOString().slice(0, 10);
    const bin = bins.find(b => b.date === dateStr);
    if (bin) bin.txs.push(tx);
  }
  return bins;
}

function getBalanceLinePath(balances: { balance: string }[], width: number, height: number) {
  if (!balances.length) return { d: '', fillD: '' };
  const max = Math.max(...balances.map(b => parseFloat(b.balance) / 1e18), 0);
  const barWidth = width / balances.length;
  const points = balances.map((b, i) => {
    const bal = parseFloat(b.balance) / 1e18;
    // Map 0 to bottom, max to top
    const y = height - (bal / (max || 1)) * (height - 8) - 4;
    const x = i * barWidth + barWidth / 2;
    return { x, y };
  });
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const cpx = (p0.x + p1.x) / 2;
    d += ` C${cpx},${p0.y} ${cpx},${p1.y} ${p1.x},${p1.y}`;
  }
  let fillD = d + ` L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;
  return { d, fillD };
}

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<{i: number, addr: string, x: number, y: number, value: number, date: string, hash: string} | null>(null);

  useEffect(() => {
    async function fetchData() {
      const res = await fetch('/api/employees');
      const data = await res.json();
      if (data.employees) {
        setEmployees(data.employees);
        if (data.employees.length > 0) {
          // Debug log for dailyBalances of the first address
          // eslint-disable-next-line no-console
          console.log('Daily balances for', data.employees[0].address, data.employees[0].dailyBalances);
        }
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  return (
    <main className="p-4">
      <h1 className="text-xl font-bold mb-4">Monitor Wallets</h1>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="space-y-1">
          {employees.map((emp) => {
            // Bin transactions by day for the last 32 days, keep all txs
            const bins = getDayBinsWithTxs(emp.spark, 32);
            // Find the maximum absolute value for scaling (use all txs)
            const maxValue = Math.max(
              ...bins.flatMap(b => b.txs.map(tx => Math.abs(tx.value))),
              1
            );
            // SVG dimensions
            const width = 448;
            const height = 36;
            const barWidth = 14;
            const zeroY = height / 2;
            // Prepare balance line path
            const { d: linePath, fillD: fillPath } = getBalanceLinePath(emp.dailyBalances, width, height);
            return (
              <div key={emp.address} className="flex items-center space-x-3 border-b pb-1 pt-1 text-base min-h-[40px]">
                <a 
                  href={`https://blockscout.shardeum.org/address/${emp.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono w-48 truncate text-blue-600 hover:text-blue-800 hover:underline text-sm"
                  style={{ fontSize: '14px' }}
                >
                  {emp.address}
                </a>
                <span className="font-semibold inline-block text-right text-sm" style={{ width: 90 }}>{Math.round(parseFloat(emp.balance) / 1e18)} SHM</span>
                <div className="ml-2 w-[448px] h-9 relative">
                  <svg width={width} height={height} style={{ display: 'block' }}>
                    {/* Zero line */}
                    <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="#888" strokeDasharray="4 2" />
                    {bins.map((bin, i) => {
                      const x = i * barWidth;
                      let posY = zeroY;
                      let negY = zeroY;
                      const posTxs = bin.txs.filter(tx => tx.value > 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
                      const negTxs = bin.txs.filter(tx => tx.value < 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
                      const txRects = [];
                      for (const tx of posTxs) {
                        const barHeight = Math.abs(tx.value) / maxValue * (height / 2 - 2);
                        posY -= barHeight;
                        txRects.push({
                          x: x + 1,
                          y: posY,
                          width: barWidth - 2,
                          height: barHeight,
                          color: '#22c55e',
                          tx,
                          date: bin.date
                        });
                        posY -= 1;
                      }
                      for (const tx of negTxs) {
                        const barHeight = Math.abs(tx.value) / maxValue * (height / 2 - 2);
                        txRects.push({
                          x: x + 1,
                          y: negY,
                          width: barWidth - 2,
                          height: barHeight,
                          color: '#ef4444',
                          tx,
                          date: bin.date
                        });
                        negY += barHeight + 1;
                      }
                      return txRects.map((rect, j) => (
                        <a
                          key={j}
                          href={rect.tx.hash ? `https://blockscout.shardeum.org/tx/${rect.tx.hash}` : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ pointerEvents: rect.tx.hash ? 'auto' : 'none' }}
                        >
                          <rect
                            x={rect.x}
                            y={rect.y}
                            width={rect.width}
                            height={rect.height}
                            fill={rect.color}
                            rx={1}
                            style={{ cursor: rect.tx.hash ? 'pointer' : 'default' }}
                            onMouseEnter={e => {
                              const svgRect = (e.target as SVGRectElement).ownerSVGElement?.getBoundingClientRect();
                              const barRect = (e.target as SVGRectElement).getBoundingClientRect();
                              const relX = barRect.left - (svgRect?.left || 0);
                              const relY = barRect.top - (svgRect?.top || 0);
                              setHovered({i, addr: emp.address, x: relX, y: relY, value: rect.tx.value, date: rect.date, hash: rect.tx.hash});
                            }}
                            onMouseLeave={() => setHovered(null)}
                          />
                          {j < txRects.length - 1 && <rect x={rect.x} y={rect.y + rect.height} width={rect.width} height={1} fill="#fff" />} 
                        </a>
                      ));
                    })}
                  </svg>
                  {hovered && hovered.addr === emp.address && (
                    <div
                      className="pointer-events-none z-50 absolute px-2 py-1 rounded text-sm font-mono bg-blue-600 text-white shadow border border-blue-800"
                      style={{
                        fontSize: '15px',
                        left: Math.min(Math.max(hovered.x - 32, 0), width - 140),
                        top: hovered.y < height / 2 ? hovered.y + 18 : hovered.y - 28,
                        minWidth: 60,
                        maxWidth: 160,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {hovered.value > 0 ? '+' : hovered.value < 0 ? '-' : ''}{Math.abs(hovered.value).toFixed(2)} SHM<br />
                      <span className="text-[12px]">{hovered.date}</span><br />
                      {hovered.hash && (
                        <span className="text-[12px]">{hovered.hash.slice(0, 10)}...{hovered.hash.slice(-6)}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
} 