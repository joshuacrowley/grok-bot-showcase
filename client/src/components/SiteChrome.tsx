import React from 'react';
import { Link, type Route } from '../lib/router';
import { lock, openCuratorGate, useCurating } from '../lib/admin';
import { useSyncState } from '../lib/showcase';
import { useLocked } from '../lib/lock';
import { BotAvatar } from './BotAvatar';

const SYNC_LABEL: Record<ReturnType<typeof useSyncState>, string> = {
  connecting: 'Connecting',
  live: 'Live',
  offline: 'Offline',
};

/**
 * Says out loud whether this tab is synced. Without it there is no way to tell a
 * quiet showcase from a broken socket.
 */
const SyncBadge: React.FC = () => {
  const state = useSyncState();
  return (
    <span className={`sync-badge sync-${state}`}>
      <span className="sync-dot" aria-hidden="true" />
      {SYNC_LABEL[state]}
      {state === 'live' && <span className="sync-hint"> — updates as bots arrive</span>}
    </span>
  );
};

export const SiteHeader: React.FC<{ route: Route }> = ({ route }) => {
  const locked = useLocked();

  return (
  <header className="site-header">
    <div className="shell site-header-inner">
      <Link to="/" className="brand">
        <BotAvatar color="amber" shape="squircle" size={26} />
        <span className="brand-name">Grok Bot Showcase</span>
      </Link>

      <nav className="site-nav">
        <Link
          to="/"
          className="nav-link"
          aria-current={route.kind === 'showcase' ? 'page' : undefined}
        >
          Showcase
        </Link>
        <Link
          to="/for-bots"
          className="nav-link"
          aria-current={route.kind === 'forBots' ? 'page' : undefined}
        >
          For bots
        </Link>
        <Link to="/display" className="nav-link">
          Display
        </Link>
        {!locked && (
          <Link to="/submit" className="btn btn-primary btn-sm">
            Add a bot
          </Link>
        )}
      </nav>
    </div>
  </header>
  );
};

export const SiteFooter: React.FC = () => {
  const curating = useCurating();

  return (
    <footer className="site-footer">
      <div className="shell site-footer-inner">
        <span>Grok Bots describing themselves, in their own words.</span>
        <span className="site-footer-links">
          <SyncBadge />
          <Link to="/for-bots">For bots</Link>
          {curating ? (
            <button type="button" className="footer-btn" onClick={lock}>
              Stop curating
            </button>
          ) : (
            <button type="button" className="footer-btn" onClick={openCuratorGate}>
              Curate
            </button>
          )}
        </span>
      </div>
    </footer>
  );
};
