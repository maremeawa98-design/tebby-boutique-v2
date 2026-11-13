import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fcfa } from '../lib/format';

type Report = {
  revenue: number;
  orders: number;
  cancelled: number;
  waiting: number;
  days: { day: string; revenue: number }[];
  top: { name: string; quantity: number; revenue: number }[];
};

const PERIODS = [7, 30, 90];
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function DailySales({ days }: { days: Report['days'] }) {
  const max = Math.max(...days.map((d) => d.revenue), 1);
  return (
    <>
      <div className="bars" role="img" aria-label="Ventes par jour, détail dans le tableau ci-dessous">
        {days.map((d) => (
          <span className="bar" key={d.day} title={`${dayLabel(d.day)} : ${fcfa(d.revenue)}`}>
            <i style={{ height: d.revenue ? `${Math.max(3, (d.revenue / max) * 100)}%` : 0 }} />
          </span>
        ))}
      </div>
      <div className="row between muted"><span>{dayLabel(days[0].day)}</span><span>{dayLabel(days[days.length - 1].day)}</span></div>
      <details className="daily">
        <summary>Voir le détail par jour</summary>
        <table>
          <thead><tr><th>Jour</th><th>Ventes</th></tr></thead>
          <tbody>
            {days.filter((d) => d.revenue > 0).map((d) => <tr key={d.day}><td>{dayLabel(d.day)}</td><td>{fcfa(d.revenue)}</td></tr>)}
          </tbody>
        </table>
      </details>
    </>
  );
}

export default function Dashboard({ tick }: { tick: number }) {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    supabase.rpc('sales_report', { p_days: days }).then(({ data, error }) => {
      if (!live) return;
      setError(error ? 'Impossible de charger le bilan.' : '');
      if (!error) setReport(data as Report);
    });
    return () => { live = false; };
  }, [days, tick]);

  const best = report?.top[0]?.quantity ?? 1;

  return (
    <>
      <h1>Bilan</h1>
      <div className="chips" role="group" aria-label="Période">
        {PERIODS.map((p) => <button key={p} aria-pressed={p === days} onClick={() => setDays(p)}>{p} jours</button>)}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!report && !error && <p className="muted">Chargement…</p>}
      {report && (
        <div className="stack">
          <div className="tiles">
            <div className="panel tile"><span>Ventes</span><strong>{fcfa(report.revenue)}</strong></div>
            <div className="panel tile"><span>Commandes</span><strong>{report.orders}</strong></div>
            <div className="panel tile"><span>Panier moyen</span><strong>{report.orders ? fcfa(Math.round(report.revenue / report.orders)) : '–'}</strong></div>
            <div className="panel tile"><span>À confirmer</span><strong>{report.waiting}</strong></div>
          </div>
          <p className="muted">
            Les ventes comptent les commandes confirmées, hors frais de livraison.
            {report.cancelled > 0 && ` ${report.cancelled} annulée${report.cancelled > 1 ? 's' : ''} sur la période.`}
          </p>
          <section className="panel">
            <h2>Ventes par jour</h2>
            <DailySales days={report.days} />
          </section>
          <section className="panel">
            <h2>Meilleures ventes</h2>
            {report.top.length === 0 && <p className="muted">Aucune vente sur cette période.</p>}
            <ol className="top">
              {report.top.map((p) => (
                <li key={p.name}>
                  <span className="row between"><span>{p.name}</span><span className="muted">{p.quantity} vendu{p.quantity > 1 ? 's' : ''} · {fcfa(p.revenue)}</span></span>
                  <i style={{ width: `${(p.quantity / best) * 100}%` }} />
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
