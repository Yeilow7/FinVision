import React, { useEffect, useState } from 'react';
import { Brain, X, TrendingUp, TrendingDown, Shield, Target, Sparkles } from 'lucide-react';
import type { OHLCBar, AIAnalysis } from '../types';
import { api } from '../api/client';

interface AIDrawerProps {
  open: boolean;
  onClose: () => void;
  ticker: string;
  bars: OHLCBar[];
}

function computeRSI(data: number[], period = 14): number | null {
  if (data.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = data[i] - data[i - 1];
    if (ch >= 0) avgGain += ch; else avgLoss -= ch;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < data.length; i++) {
    const ch = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, ch)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -ch)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function computeEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function computeMACD(closes: number[]): { macdLine: number; signal: number; histogram: number } | null {
  if (closes.length < 26) return null;
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLineArr: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLineArr.push(ema12[i] - ema26[i]);
  }
  const signalArr = computeEMA(macdLineArr, 9);
  const last = closes.length - 1;
  return {
    macdLine: macdLineArr[last],
    signal: signalArr[last],
    histogram: macdLineArr[last] - signalArr[last],
  };
}

export default function AIDrawer({ open, onClose, ticker, bars }: AIDrawerProps) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || bars.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setAnalysis(null);

    const closes = bars.map((b) => b.close);
    const rsi = computeRSI(closes);
    const macd = computeMACD(closes);
    const currentPrice = bars[bars.length - 1].close;

    api
      .analyzeAI({ ticker, ohlcv: bars, rsi, macd, currentPrice })
      .then((res) => {
        if (!cancelled) setAnalysis(res);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err?.message || '';
          if (msg.includes('API') || msg.includes('key') || msg.includes('401') || msg.includes('ANTHROPIC')) {
            setError('Set ANTHROPIC_API_KEY in backend/.env');
          } else {
            setError(msg || 'Analysis failed');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, ticker, bars]);

  const actionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'buy': return '#00D4AA';
      case 'sell': return '#FF4757';
      default: return '#FFD700';
    }
  };

  const riskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'low': return '#00D4AA';
      case 'medium': return '#FFD700';
      case 'high': return '#FF4757';
      default: return '#00D4FF';
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full z-50 transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: 380 }}
      >
        <div className="h-full bg-navy-800 border-l border-navy-600 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-navy-600">
            <div className="flex items-center gap-2">
              <Brain size={20} style={{ color: '#00D4FF' }} />
              <span className="font-semibold text-white" style={{ fontFamily: 'Inter, sans-serif' }}>
                AI Analysis
              </span>
              <span
                className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ fontFamily: 'JetBrains Mono, monospace', color: '#00D4AA', background: 'rgba(0,212,170,0.1)' }}
              >
                {ticker}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent" style={{ borderTopColor: '#00D4FF' }} />
                <span className="text-sm text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Analyzing {ticker}...
                </span>
              </div>
            )}

            {error && (
              <div className="card bg-navy-800 border border-navy-600 rounded-xl p-4">
                <div
                  className="rounded-lg p-4 text-center"
                  style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)' }}
                >
                  <p className="text-sm font-medium" style={{ color: '#FF4757', fontFamily: 'Inter, sans-serif' }}>
                    {error}
                  </p>
                </div>
              </div>
            )}

            {analysis && !loading && (
              <>
                {/* Trend Card */}
                <div className="card bg-navy-800 border border-navy-600 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {analysis.trend.direction.toLowerCase() === 'up' ? (
                      <TrendingUp size={16} style={{ color: '#00D4AA' }} />
                    ) : (
                      <TrendingDown size={16} style={{ color: '#FF4757' }} />
                    )}
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Trend
                    </span>
                    <span
                      className={analysis.trend.direction.toLowerCase() === 'up' ? 'badge-up' : 'badge-down'}
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontWeight: 600,
                        color: analysis.trend.direction.toLowerCase() === 'up' ? '#00D4AA' : '#FF4757',
                        background: analysis.trend.direction.toLowerCase() === 'up'
                          ? 'rgba(0,212,170,0.15)'
                          : 'rgba(255,71,87,0.15)',
                      }}
                    >
                      {analysis.trend.direction.toUpperCase()} {analysis.trend.direction.toLowerCase() === 'up' ? '\u2191' : '\u2193'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Strength: <span className="text-white">{analysis.trend.strength}</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {analysis.trend.summary}
                  </p>
                </div>

                {/* Signal Card */}
                <div className="card bg-navy-800 border border-navy-600 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target size={16} style={{ color: '#00D4FF' }} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Signal
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="text-sm font-bold"
                      style={{ fontFamily: 'JetBrains Mono, monospace', color: actionColor(analysis.signal.action) }}
                    >
                      {analysis.signal.action.toUpperCase()}
                    </span>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-navy-600 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.round(analysis.signal.confidence * 100)}%`,
                            background: actionColor(analysis.signal.action),
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {Math.round(analysis.signal.confidence * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {analysis.signal.reasoning}
                  </p>
                </div>

                {/* Key Levels Card */}
                <div className="card bg-navy-800 border border-navy-600 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Target size={16} style={{ color: '#FFD700' }} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Key Levels
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Support</div>
                      {analysis.keyLevels.support.map((s, i) => (
                        <div
                          key={i}
                          className="text-xs mb-0.5"
                          style={{ fontFamily: 'JetBrains Mono, monospace', color: '#00D4AA' }}
                        >
                          ${s.toFixed(2)}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Resistance</div>
                      {analysis.keyLevels.resistance.map((r, i) => (
                        <div
                          key={i}
                          className="text-xs mb-0.5"
                          style={{ fontFamily: 'JetBrains Mono, monospace', color: '#FF4757' }}
                        >
                          ${r.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Risk Card */}
                <div className="card bg-navy-800 border border-navy-600 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={16} style={{ color: riskColor(analysis.risk.level) }} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Risk
                    </span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        color: riskColor(analysis.risk.level),
                        background: `${riskColor(analysis.risk.level)}20`,
                      }}
                    >
                      {analysis.risk.level.toUpperCase()}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {analysis.risk.factors.map((f, i) => (
                      <li key={i} className="text-xs text-gray-300 flex items-start gap-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <span className="text-gray-500 mt-0.5">-</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Summary Card */}
                <div className="card bg-navy-800 border border-navy-600 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={16} style={{ color: '#00D4FF' }} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Summary
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {analysis.summary}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
