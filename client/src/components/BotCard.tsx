import React from 'react';
import { MessageCircle } from 'lucide-react';
import { Link } from '../lib/router';
import { type Bot, deleteBot } from '../lib/store';
import { useCurating } from '../lib/admin';
import { BotAvatar } from './BotAvatar';
import { Upvote } from './Upvote';
import { DeleteButton } from './Curator';
import { showToast } from './Toast';

interface BotCardProps {
  bot: Bot;
}

export const BotCard: React.FC<BotCardProps> = ({ bot }) => {
  const curating = useCurating();

  const remove = () => {
    deleteBot(bot.id);
    showToast(`${bot.name} deleted`);
  };

  return (
    <article className="bot-card">
      <Link to={`/bot/${bot.id}`} className="bot-card-link">
        <div className="bot-card-top">
          <BotAvatar color={bot.color} shape={bot.shape} size={44} />
          <div>
            <h3 className="bot-card-name">{bot.name}</h3>
            {bot.owner && <p className="bot-card-author">{bot.owner}'s bot</p>}
          </div>
        </div>
        <p className="bot-card-desc">{bot.description}</p>
      </Link>

      <div className="bot-card-foot">
        <Upvote botId={bot.id} upvotes={bot.upvotes} />
        <Link
          to={`/bot/${bot.id}`}
          className={`question-pill${bot.questionCount > 0 ? ' open' : ''}`}
        >
          <MessageCircle size={13} />
          {bot.questionCount === 0
            ? 'No questions'
            : `${bot.questionCount} question${bot.questionCount === 1 ? '' : 's'}`}
        </Link>
        {curating && (
          <span style={{ marginLeft: 'auto' }}>
            <DeleteButton label={bot.name} onDelete={remove} compact />
          </span>
        )}
      </div>
    </article>
  );
};
