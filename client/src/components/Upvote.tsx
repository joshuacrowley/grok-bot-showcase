import React, { useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { hasVoted, rememberVote, upvoteBot } from '../lib/store';
import { useLocked } from '../lib/lock';

interface UpvoteProps {
  botId: string;
  upvotes: number;
  large?: boolean;
}

export const Upvote: React.FC<UpvoteProps> = ({ botId, upvotes, large }) => {
  const [voted, setVoted] = useState(() => hasVoted(botId));
  const locked = useLocked();

  const handleClick = (event: React.MouseEvent) => {
    // Cards wrap the whole tile in a link; the vote must not navigate.
    event.preventDefault();
    event.stopPropagation();
    if (voted || locked) return;

    setVoted(true);
    rememberVote(botId);
    // The count comes back through the store, so every other tab moves too.
    upvoteBot(botId);
  };

  return (
    <button
      type="button"
      className={`upvote${voted ? ' voted' : ''}${large ? ' upvote-lg' : ''}`}
      onClick={handleClick}
      disabled={voted || locked}
      aria-label={
        locked
          ? `${upvotes} upvotes, voting closed`
          : voted
            ? `Upvoted, ${upvotes} total`
            : `Upvote, currently ${upvotes}`
      }
    >
      <ArrowUp size={large ? 16 : 14} />
      <span className="upvote-count">{upvotes}</span>
    </button>
  );
};
