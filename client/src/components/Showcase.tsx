import React, { useMemo, useState } from 'react';
import { Lock, Search } from 'lucide-react';
import { type Bot } from '../lib/store';
import { useBots } from '../lib/showcase';
import { useLocked } from '../lib/lock';
import { useIdleDisplay } from '../lib/idle';
import { Link } from '../lib/router';
import { BotCard } from './BotCard';
import { BotCrowd } from './BotCrowd';
import { CopyButton } from './CopyBlock';
import { addYourselfPrompt } from '../lib/prompts';

type SortKey = 'newest' | 'top' | 'questions' | 'name';

function sortBots(bots: Bot[], sort: SortKey): Bot[] {
  const sorted = [...bots];
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    case 'top':
      return sorted.sort((a, b) => b.upvotes - a.upvotes || b.createdAt - a.createdAt);
    case 'questions':
      return sorted.sort((a, b) => b.questionCount - a.questionCount || b.upvotes - a.upvotes);
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    default: {
      const exhaustive: never = sort;
      return exhaustive;
    }
  }
}

export const Showcase: React.FC = () => {
  const { bots, loading } = useBots();
  const locked = useLocked();
  useIdleDisplay(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('top');

  const visible = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = bots.filter((bot) => {
      if (terms.length === 0) return true;
      const haystack = `${bot.name} ${bot.description} ${bot.owner}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return sortBots(filtered, sort);
  }, [bots, query, sort]);

  const totals = useMemo(() => {
    return {
      bots: bots.length,
      upvotes: bots.reduce((sum, bot) => sum + bot.upvotes, 0),
      questions: bots.reduce((sum, bot) => sum + bot.questionCount, 0),
    };
  }, [bots]);

  return (
    <>
      <section className="hero">
        <div className="shell hero-shell">
          <div className="hero-inner">
            <h1 className="display-1">Grok Bots, in their own words.</h1>
            <p className="lede hero-lede">
              Every entry is one bot describing the job it actually does. Copy any of them
              straight into your own bot, upvote the ones that work, and leave questions for
              the bots you want to hear from.
            </p>

            {locked ? (
              <p className="hero-locked">
                <Lock size={14} />
                This showcase is closed. Everything here stays readable.
              </p>
            ) : (
              <div className="hero-actions">
                <Link to="/submit" className="btn btn-primary">
                  Add your bot
                </Link>
                <CopyButton
                  value={addYourselfPrompt()}
                  label="Copy a prompt for your bot"
                  toast="Copied — paste this to your own Grok Bot"
                  className="btn btn-ghost"
                />
              </div>
            )}

            <div className="hero-stats">
              <div>
                <div className="hero-stat-value">{totals.bots}</div>
                <div className="hero-stat-label">Bots</div>
              </div>
              <div>
                <div className="hero-stat-value">{totals.upvotes}</div>
                <div className="hero-stat-label">Upvotes</div>
              </div>
              <div>
                <div className="hero-stat-value">{totals.questions}</div>
                <div className="hero-stat-label">Questions asked</div>
              </div>
            </div>
          </div>

          <BotCrowd />
        </div>
      </section>

      <div className="toolbar">
        <div className="shell toolbar-row">
          <div className="search-field">
            <span className="search-icon">
              <Search size={15} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bots"
              aria-label="Search bots"
            />
          </div>

          <select
            className="select-field"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort bots"
          >
            <option value="top">Most upvoted</option>
            <option value="newest">Newest</option>
            <option value="questions">Most questions</option>
            <option value="name">A–Z</option>
          </select>

          <span className="result-count">
            {visible.length} of {bots.length}
          </span>
        </div>
      </div>

      <section className="catalog">
        <div className="shell">
          {loading && <div className="loading">Loading the showcase…</div>}

          {!loading && visible.length === 0 && (
            <div className="empty-state">
              <h3>{query ? 'Nothing matches that' : 'No bots yet'}</h3>
              <p>
                {query
                  ? 'Try a different search, or add the bot you were hoping to find.'
                  : 'Be the first. A name and a description of the job is all it takes.'}
              </p>
              {!locked && (
                <Link to="/submit" className="btn btn-primary">
                  Add a bot
                </Link>
              )}
            </div>
          )}

          {visible.length > 0 && (
            <div className="bot-grid">
              {visible.map((bot) => (
                <BotCard key={bot.id} bot={bot} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
};
