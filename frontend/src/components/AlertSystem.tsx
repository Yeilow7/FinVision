import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Plus, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useAppStore } from '../store';
import { api } from '../api/client';

const POLL_INTERVAL = 15_000;

export default function AlertSystem() {
  const { alerts, addAlert, removeAlert, triggerAlert } = useAppStore();
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [price, setPrice] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeCount = alerts.filter((a) => a.active && !a.triggered).length;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Poll prices for active alerts
  const checkAlerts = useCallback(async () => {
    const activeAlerts = alerts.filter((a) => a.active && !a.triggered);
    if (activeAlerts.length === 0) return;

    const tickers = [...new Set(activeAlerts.map((a) => a.ticker))];
    try {
      const quotes = await api.getMultiQuote(tickers);
      const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));

      for (const alert of activeAlerts) {
        const current = priceMap.get(alert.ticker);
        if (current == null) continue;

        const met =
          (alert.condition === 'above' && current >= alert.price) ||
          (alert.condition === 'below' && current <= alert.price);

        if (met) {
          triggerAlert(alert.id);

          // Browser notification
          if (Notification.permission === 'granted') {
            new Notification(`Price Alert: ${alert.ticker}`, {
              body: `${alert.ticker} is now ${alert.condition === 'above' ? 'above' : 'below'} $${alert.price.toFixed(2)} (current: $${current.toFixed(2)})`,
              icon: '/favicon.ico',
            });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then((perm) => {
              if (perm === 'granted') {
                new Notification(`Price Alert: ${alert.ticker}`, {
                  body: `${alert.ticker} is now ${alert.condition === 'above' ? 'above' : 'below'} $${alert.price.toFixed(2)} (current: $${current.toFixed(2)})`,
                  icon: '/favicon.ico',
                });
              }
            });
          }
        }
      }
    } catch {
      // silently ignore polling errors
    }
  }, [alerts, triggerAlert]);

  useEffect(() => {
    if (activeCount === 0) return;

    // Request notification permission proactively
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    checkAlerts();
    const id = setInterval(checkAlerts, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [activeCount, checkAlerts]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ticker.trim().toUpperCase();
    if (!trimmed || !price) return;
    addAlert({ ticker: trimmed, condition, price: parseFloat(price), active: true });
    setTicker('');
    setPrice('');
    setCondition('above');
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-navy-700 transition-colors"
        aria-label="Price Alerts"
      >
        <Bell size={20} />
        {activeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-navy-600 bg-navy-800 shadow-2xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-navy-600 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Price Alerts</h3>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>

          {/* Add alert form */}
          <form onSubmit={handleAdd} className="border-b border-navy-600 p-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="input-field flex-1 text-xs"
              />
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
                className="input-field w-24 text-xs"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                placeholder="Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input-field flex-1 text-xs"
              />
              <button type="submit" className="btn-primary flex items-center gap-1 text-xs px-3">
                <Plus size={14} /> Add
              </button>
            </div>
          </form>

          {/* Alert list */}
          <div className="max-h-72 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">No alerts yet</p>
            ) : (
              <ul className="divide-y divide-navy-700">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className={`flex items-center gap-3 px-4 py-2.5 border-l-2 ${
                      alert.triggered
                        ? 'border-accent-yellow opacity-60'
                        : alert.active
                        ? 'border-accent-green'
                        : 'border-transparent'
                    }`}
                  >
                    {alert.condition === 'above' ? (
                      <ArrowUp size={14} className="text-accent-green shrink-0" />
                    ) : (
                      <ArrowDown size={14} className="text-accent-red shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{alert.ticker}</span>
                        <span className="text-[10px] text-slate-400">
                          {alert.condition === 'above' ? 'above' : 'below'} ${alert.price.toFixed(2)}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] ${
                          alert.triggered
                            ? 'text-accent-yellow'
                            : alert.active
                            ? 'text-accent-green'
                            : 'text-slate-500'
                        }`}
                      >
                        {alert.triggered ? 'Triggered' : alert.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <button
                      onClick={() => removeAlert(alert.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                      aria-label="Delete alert"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
