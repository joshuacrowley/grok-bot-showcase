import React, { StrictMode } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { createLocalPersister } from 'tinybase/persisters/persister-browser';
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { Provider, useCreatePersister, useCreateSynchronizer } from 'tinybase/ui-react';
import { store } from './lib/store';
import { setSyncState } from './lib/showcase';
import { Link, type Route, useRoute, useScrollReset } from './lib/router';
import { SiteFooter, SiteHeader } from './components/SiteChrome';
import { Showcase } from './components/Showcase';
import { BotDetailPage } from './components/BotDetail';
import { SubmitForm } from './components/SubmitForm';
import { ForBots } from './components/ForBots';
import { Display } from './components/Display';
import { ToastHost } from './components/Toast';
import { CuratorBar, CuratorGate } from './components/Curator';

const NotFound: React.FC<{ path: string }> = ({ path }) => (
  <div className="shell-narrow" style={{ paddingTop: 44 }}>
    <div className="empty-state">
      <h3>Nothing at {path}</h3>
      <p>That link does not point anywhere on the showcase.</p>
      <Link to="/" className="btn btn-primary">
        Back to the showcase
      </Link>
    </div>
  </div>
);

const RouteView: React.FC<{ route: Route }> = ({ route }) => {
  switch (route.kind) {
    case 'showcase':
      return <Showcase />;
    case 'detail':
      return <BotDetailPage id={route.id} />;
    case 'submit':
      return <SubmitForm />;
    case 'forBots':
      return <ForBots />;
    case 'display':
      return <Display />;
    case 'notFound':
      return <NotFound path={route.path} />;
    default: {
      const exhaustive: never = route;
      return exhaustive;
    }
  }
};

/** The Worker serves this app and the sync socket, so same host, same path. */
const SYNC_PATH = '/api/sync';

function syncUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  // In dev the app is on Vite's port while the Worker holds the socket.
  const host = import.meta.env.DEV ? 'localhost:53248' : window.location.host;
  return scheme + host + SYNC_PATH;
}

export const App: React.FC = () => {
  const route = useRoute();
  useScrollReset(route.kind === 'detail' ? `detail:${route.id}` : route.kind);

  // Local copy first, so a reload paints instantly and an offline tab still works.
  useCreatePersister(
    store,
    (forStore) => createLocalPersister(forStore, `grok-bot-showcase${SYNC_PATH}`),
    [],
    async (persister) => {
      await persister.startAutoLoad();
      await persister.startAutoSave();
    },
  );

  useCreateSynchronizer(store, async (forStore) => {
    const socket = new ReconnectingWebSocket(syncUrl());
    const synchronizer = await createWsSynchronizer(forStore, socket);
    await synchronizer.startSync();
    setSyncState('live');

    // A reconnect needs an explicit round trip, otherwise this tab keeps
    // whatever it had while it was away.
    socket.addEventListener('open', () => {
      setSyncState('live');
      synchronizer.load().then(() => synchronizer.save());
    });
    socket.addEventListener('close', () => setSyncState('offline'));

    return synchronizer;
  });

  // Display mode takes the whole screen — no header, footer or curator bar.
  if (route.kind === 'display') {
    return (
      <StrictMode>
        <Provider store={store}>
          <Display />
          <ToastHost />
        </Provider>
      </StrictMode>
    );
  }

  return (
    <StrictMode>
      <Provider store={store}>
        <div className="site">
          <SiteHeader route={route} />
          <main className="site-main">
            <RouteView route={route} />
          </main>
          <SiteFooter />
          <ToastHost />
          <CuratorGate />
          <CuratorBar />
        </div>
      </Provider>
    </StrictMode>
  );
};
