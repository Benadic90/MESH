import '../styles/globals.css';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAppStore } from '../store/appStore';
import Head from 'next/head';
import { useEffect, useState } from 'react';

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const getLinkClass = (path) => router.pathname === path ? 'active' : '';
  const { isOffline, toggleOfflineMode, offlineRequests = [] } = useAppStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleRouteChange = () => setIsMenuOpen(false);
    router.events.on('routeChangeStart', handleRouteChange);
    return () => router.events.off('routeChangeStart', handleRouteChange);
  }, [router.events]);

  return (
    <>
      <Head>
        <title>RESCUE-MESH | Emergency Help</title>
        <meta name="description" content="Simple emergency requests and community response coordination." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
      </Head>
      <nav className="navbar" aria-label="Main navigation">
        <div className="navbar-top">
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#c62828', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#c62828' }} />
            RESCUE-MESH
          </div>
          <button
            className="mobile-menu-btn"
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? '✕' : '☰'}
          </button>
        </div>

        <div className={`nav-links ${isMenuOpen ? 'open' : ''}`}>
          <Link href="/" className={getLinkClass('/')} onClick={() => setIsMenuOpen(false)}>Ask for help</Link>
          <Link href="/status" className={getLinkClass('/status')} onClick={() => setIsMenuOpen(false)}>Check request</Link>
          <Link href="/dashboard" className={getLinkClass('/dashboard')} onClick={() => setIsMenuOpen(false)}>Responder dashboard</Link>
          <Link href="/map" className={getLinkClass('/map')} onClick={() => setIsMenuOpen(false)}>Map</Link>
        </div>

        <div className={`navbar-controls ${isMenuOpen ? 'open' : ''}`}>
          {isOffline && (
            <span role="status" style={{
              color: '#7b4c00',
              fontSize: '12px',
              fontWeight: '700',
              padding: '7px 10px',
              background: '#fff8e7',
              borderRadius: '8px',
              border: '1px solid #f3d48a'
            }}>
              Offline save mode · {offlineRequests.length} pending
            </span>
          )}
          <button
            type="button"
            onClick={toggleOfflineMode}
            style={{
              padding: '9px 13px',
              background: isOffline ? '#1769aa' : '#f2f6fb',
              color: isOffline ? '#fff' : '#23405f',
              border: isOffline ? '1px solid #1769aa' : '1px solid #d8e1ed',
              fontSize: '12px',
              fontWeight: '750'
            }}
          >
            {isOffline ? 'Reconnect / Sync' : 'Use offline save mode'}
          </button>
        </div>
      </nav>
      <main className="container">
        <Component {...pageProps} />
      </main>
    </>
  );
}
