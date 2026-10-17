import './globals.css';
import PWA from '@/components/pwa';
export const metadata = {
  title: { default: 'Appnix Staff Manager', template: '%s · Appnix' },
  description: 'A little more organized, every day. Attendance, salaries, and shared expenses for your team.',
  manifest: '/manifest.json', applicationName: 'Appnix Staff Manager',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Appnix' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' }
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#147d64', viewportFit: 'cover' };
export default function RootLayout({ children }) { return <html lang="en"><body>{children}<PWA /></body></html>; }
