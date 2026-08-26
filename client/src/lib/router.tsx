import React, { useCallback, useEffect, useState } from 'react';

export type Route =
  | { kind: 'showcase' }
  | { kind: 'detail'; id: string }
  | { kind: 'submit' }
  | { kind: 'forBots' }
  | { kind: 'display' }
  | { kind: 'notFound'; path: string };

function parse(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'showcase' };
  if (path === '/submit') return { kind: 'submit' };
  if (path === '/for-bots') return { kind: 'forBots' };
  if (path === '/display') return { kind: 'display' };
  const detail = path.match(/^\/bot\/([^/]+)$/);
  if (detail) return { kind: 'detail', id: decodeURIComponent(detail[1]) };
  return { kind: 'notFound', path };
}

const NAV_EVENT = 'grokbot:navigate';

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace) {
    window.history.replaceState({}, '', to);
  } else {
    window.history.pushState({}, '', to);
  }
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.pathname));

  useEffect(() => {
    const sync = () => setRoute(parse(window.location.pathname));
    window.addEventListener('popstate', sync);
    window.addEventListener(NAV_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(NAV_EVENT, sync);
    };
  }, []);

  return route;
}

/** Scrolls to top whenever the route key changes, matching browser expectations. */
export function useScrollReset(key: string): void {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [key]);
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export const Link: React.FC<LinkProps> = ({ to, onClick, children, ...rest }) => {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      // Let the browser handle new-tab and modified clicks.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      navigate(to);
    },
    [to, onClick],
  );

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
