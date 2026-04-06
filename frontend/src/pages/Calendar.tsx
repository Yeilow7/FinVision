import { useState, useEffect } from 'react';
import { Calendar as CalIcon, AlertTriangle, Clock } from 'lucide-react';
import { api } from '../api/client';
import type { CalendarEvent } from '../types';

const IMPACT_STYLES: Record<string, string> = {
  high:   'bg-accent-red/15 text-accent-red border-accent-red/30',
  medium: 'bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30',
  low:    'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

function groupByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const grouped: Record<string, CalendarEvent[]> = {};
  events.forEach((e) => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });
  return grouped;
}

function formatDate(d: string): string {
  const date = new Date(d + 'T12:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d === today.toISOString().split('T')[0]) return 'Today';
  if (d === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'high'>('all');

  useEffect(() => {
    api.getCalendar().then(setEvents).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'high' ? events.filter((e) => e.impact === 'high') : events;
  const grouped = groupByDate(filtered);

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-[1000px] mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Economic Calendar</h1>
          <p className="text-slate-500 text-sm mt-0.5">Upcoming macro events & earnings</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${filter === 'all' ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30' : 'text-slate-500 border border-transparent hover:text-slate-300'}`}
          >All Events</button>
          <button onClick={() => setFilter('high')}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${filter === 'high' ? 'bg-accent-red/15 text-accent-red border border-accent-red/30' : 'text-slate-500 border border-transparent hover:text-slate-300'}`}
          >High Impact Only</button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card animate-pulse h-20" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, evts]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3 sticky top-0 z-10 bg-navy-950 py-2">
                <CalIcon size={13} className="text-accent-cyan" />
                <span className="text-sm font-bold text-white">{formatDate(date)}</span>
                <span className="text-[10px] font-mono text-slate-600">{date}</span>
                <span className="text-[10px] font-mono text-slate-600 ml-auto">{evts.length} events</span>
              </div>
              <div className="space-y-2">
                {evts.map((e, i) => (
                  <div key={i} className={`card flex items-center gap-4 ${e.impact === 'high' ? 'border-l-2 border-l-accent-red' : 'border-l-2 border-l-transparent'}`}>
                    <div className="shrink-0 w-16 text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-mono text-slate-400">
                        <Clock size={10} />
                        {e.time}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 font-medium">{e.event}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">{e.country}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] font-mono text-slate-500 uppercase">Forecast</div>
                        <div className="text-xs font-mono text-white">{e.forecast}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-mono text-slate-500 uppercase">Previous</div>
                        <div className="text-xs font-mono text-slate-400">{e.previous}</div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${IMPACT_STYLES[e.impact]}`}>
                        {e.impact === 'high' && <AlertTriangle size={9} />}
                        {e.impact.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
