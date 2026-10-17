'use client';
import { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
export default function PWA() {
  const [prompt, setPrompt] = useState(null), [offline, setOffline] = useState(false), [ios, setIos] = useState(false);
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
    const install = e => { e.preventDefault(); setPrompt(e); };
    const update = () => setOffline(!navigator.onLine);
    const installed = () => { setPrompt(null); setIos(false); };
    update(); setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone);
    window.addEventListener('beforeinstallprompt', install); window.addEventListener('appinstalled', installed);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('appinstalled', installed); window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return <>{offline && <div className="connection-banner" role="status"><WifiOff size={16} /> You’re offline. Reconnect to view or save staff records.</div>}{prompt && <button className="install-button" onClick={async () => { await prompt.prompt(); setPrompt(null); }}><Download size={16} /> Install Appnix</button>}{ios && <div className="ios-hint">Install on iPhone: tap Share, then “Add to Home Screen”. <button onClick={() => setIos(false)} aria-label="Dismiss install hint">Dismiss</button></div>}</>;
}
