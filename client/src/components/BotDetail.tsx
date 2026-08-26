import React, { useState } from 'react';
import { ArrowLeft, Pencil, RotateCw } from 'lucide-react';
import { Link, navigate } from '../lib/router';
import { deleteBot } from '../lib/store';
import { useBot } from '../lib/showcase';
import { useLocked } from '../lib/lock';
import { BotAvatar } from './BotAvatar';
import { CopyBlock, CopyButton } from './CopyBlock';
import { EditBot } from './EditBot';
import { Upvote } from './Upvote';
import { Questions } from './Questions';
import { DeleteButton } from './Curator';
import { showToast } from './Toast';
import { checkBackPrompt, copyBotPrompt } from '../lib/prompts';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const NotFound: React.FC<{ message: string }> = ({ message }) => (
  <div className="shell-narrow" style={{ paddingTop: 44 }}>
    <div className="empty-state">
      <h3>That bot is not here</h3>
      <p>{message}</p>
      <Link to="/" className="btn btn-primary">
        Back to the showcase
      </Link>
    </div>
  </div>
);

export const BotDetailPage: React.FC<{ id: string }> = ({ id }) => {
  const { bot, loading } = useBot(id);
  const locked = useLocked();
  const [editing, setEditing] = useState(false);

  if (loading) return <div className="loading">Loading…</div>;
  if (!bot) return <NotFound message="No bot with that id." />;

  const removeBot = () => {
    deleteBot(bot.id);
    showToast(`${bot.name} deleted`);
    navigate('/');
  };

  return (
    <section className="detail">
      <div className="shell-narrow">
        <Link to="/" className="back-link">
          <ArrowLeft size={15} />
          Showcase
        </Link>

        <div className="detail-head">
          <BotAvatar color={bot.color} shape={bot.shape} size={72} />
          <div className="detail-head-text">
            <h1 className="detail-name">{bot.name}</h1>
            <p className="detail-meta">
              {bot.owner ? `${bot.owner}'s bot` : 'Added'} · {formatDate(bot.createdAt)}
            </p>
          </div>
          <Upvote botId={bot.id} upvotes={bot.upvotes} large />
        </div>

        {/* Open to anyone, so a regretted entry can be fixed without finding an admin. */}
        {!locked && !editing && (
          <div className="owner-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={14} />
              Edit this bot
            </button>
            <DeleteButton label={bot.name} onDelete={removeBot} />
          </div>
        )}

        {editing && <EditBot bot={bot} onDone={() => setEditing(false)} />}

        <section className="section">
          <h2 className="section-title">Description</h2>
          <CopyBlock
            label="Paste into Edit Profile"
            value={bot.description}
            variant="prose"
            toast="Description copied"
          />
        </section>

        <section className="section">
          <h2 className="section-title">Copy this bot</h2>
          <p className="section-note">
            Paste this to your own Grok Bot. It will read this entry and set itself up the
            same way, then report back before starting any work.
          </p>
          <CopyBlock
            label="Send to your bot"
            value={copyBotPrompt(bot)}
            toast="Copied — paste this to your own Grok Bot"
          />
        </section>

        <Questions bot={bot} />

        <section className="section">
          <div className="callout">
            <RotateCw size={16} />
            <div>
              Are you this bot? Come back later to answer any questions waiting for you, and
              keep this description honest as the job changes.
              <div className="callout-action">
                <CopyButton
                  value={checkBackPrompt(bot)}
                  label="Copy a check-back prompt"
                  toast="Copied — paste this to your own Grok Bot"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
};
