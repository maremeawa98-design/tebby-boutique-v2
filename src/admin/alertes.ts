import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Latest = { id: number; number: string; customer_name: string };
const KEY = 'tebby-alertes';

const read = () => {
  try {
    return localStorage.getItem(KEY) === 'oui';
  } catch {
    return false;
  }
};

// Deux notes courtes, sans fichier audio à charger.
function chime(audio: AudioContext) {
  [880, 1175].forEach((pitch, i) => {
    const start = audio.currentTime + i * 0.18;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = pitch;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    tone.connect(gain).connect(audio.destination);
    tone.start(start);
    tone.stop(start + 0.34);
  });
}

// Le direct prévient tout de suite ; la vérification régulière rattrape une connexion coupée.
export function useOrderAlerts() {
  const [tick, setTick] = useState(0);
  const [unseen, setUnseen] = useState(0);
  const [toast, setToast] = useState('');
  const [enabled, setEnabled] = useState(read);
  const lastId = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const on = useRef(enabled);

  const announce = useCallback((order: Latest) => {
    if (lastId.current !== null && order.id <= lastId.current) return;
    lastId.current = order.id;
    setUnseen((n) => n + 1);
    setToast(`Nouvelle commande ${order.number} : ${order.customer_name}`);
    setTick((n) => n + 1);
    if (!on.current) return;
    if (audio.current) chime(audio.current);
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try {
        new Notification(`Nouvelle commande ${order.number}`, { body: order.customer_name, tag: order.number });
      } catch {
        // Android refuse ce type de notification : le son et le compteur restent actifs.
      }
    }
  }, []);

  useEffect(() => {
    const latest = async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, number, customer_name')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as Latest | null;
    };
    latest().then((order) => {
      lastId.current ??= order?.id ?? 0;
    });
    const channel = supabase
      .channel('commandes', { config: { private: true } })
      .on('broadcast', { event: 'INSERT' }, ({ payload }) => announce(payload as Latest))
      .on('broadcast', { event: 'UPDATE' }, () => setTick((n) => n + 1));
    // Le canal est privé : il faut présenter la session avant de s'y abonner.
    supabase.realtime.setAuth().then(() => channel.subscribe());
    const timer = setInterval(async () => {
      const order = await latest();
      if (order && lastId.current !== null) announce(order);
    }, 60000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [announce]);

  useEffect(() => {
    if (!enabled) return;
    // Le navigateur n'autorise le son qu'après un geste de l'utilisateur.
    const wake = () => {
      audio.current ??= new AudioContext();
      audio.current.resume();
    };
    addEventListener('pointerdown', wake, { once: true });
    return () => removeEventListener('pointerdown', wake);
  }, [enabled]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.title = unseen ? `(${unseen}) Admin TEBBY` : 'Admin TEBBY';
  }, [unseen]);

  async function enable() {
    audio.current ??= new AudioContext();
    await audio.current.resume();
    chime(audio.current);
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    on.current = true;
    setEnabled(true);
    try {
      localStorage.setItem(KEY, 'oui');
    } catch {
      // Sans stockage, le réglage dure jusqu'à la fermeture de la page.
    }
  }

  return {
    tick,
    unseen,
    toast,
    enabled,
    enable,
    clearToast: () => setToast(''),
    markSeen: useCallback(() => setUnseen(0), []),
  };
}
