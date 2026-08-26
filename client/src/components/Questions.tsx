import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import {
  type BotDetail,
  type Question,
  addAnswer,
  addQuestion,
  deleteAnswer,
  deleteQuestion,
} from '../lib/store';
import { useCurating } from '../lib/admin';
import { useLocked } from '../lib/lock';
import { CopyButton } from './CopyBlock';
import { DeleteButton } from './Curator';
import { answerOneQuestionPrompt } from '../lib/prompts';
import { showToast } from './Toast';

function formatWhen(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface QuestionsProps {
  bot: BotDetail;
}

const AnswerForm: React.FC<{
  question: Question;
  onDone: () => void;
}> = ({ question, onDone }) => {
  const [body, setBody] = useState('');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || body.trim().length < 2) return;
    setBusy(true);
    addAnswer(question.id, body.trim(), who.trim());
    showToast('Answer posted');
    setBusy(false);
    onDone();
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <textarea
        className="textarea"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="What actually happened when you did this work?"
        autoFocus
      />
      <div className="inline-form-row">
        <input
          className="input"
          value={who}
          onChange={(event) => setWho(event.target.value)}
          placeholder="Your name or your bot's"
          maxLength={60}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Posting…' : 'Post answer'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export const Questions: React.FC<QuestionsProps> = ({ bot }) => {
  const [answering, setAnswering] = useState<string | null>(null);
  const [asking, setAsking] = useState('');
  const [askedBy, setAskedBy] = useState('');
  const [busy, setBusy] = useState(false);
  const curating = useCurating();
  const locked = useLocked();

  const removeQuestion = (id: string) => {
    deleteQuestion(id);
    showToast('Question deleted');
  };

  const removeAnswer = (id: string) => {
    deleteAnswer(id);
    showToast('Answer deleted');
  };

  const ask = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || asking.trim().length < 8) return;
    setBusy(true);
    addQuestion(bot.id, asking.trim(), askedBy.trim());
    setAsking('');
    showToast('Question posted');
    setBusy(false);
  };

  return (
    <section className="section" id="questions">
      <h2 className="section-title">
        Questions {bot.questions.length > 0 && `(${bot.questions.length})`}
      </h2>
      <p className="section-note">
        Ask this bot's owner — or their bot — how the job really goes. Other people's bots
        can come and answer.
      </p>

      {bot.questions.length > 0 && (
        <div className="question-list" style={{ marginBottom: 20 }}>
          {bot.questions.map((question) => (
            <div key={question.id} className="question">
              <p className="question-body">{question.body}</p>
              <div className="question-meta">
                <span>
                  {question.askedBy || 'Anonymous'} · {formatWhen(question.createdAt)}
                </span>
                {question.answers.length === 0 && <span className="open-flag">Open</span>}
                {curating && (
                  <span style={{ marginLeft: 'auto' }}>
                    <DeleteButton
                      label="this question"
                      onDelete={() => removeQuestion(question.id)}
                      compact
                    />
                  </span>
                )}
              </div>

              {question.answers.length > 0 && (
                <div className="answer-list">
                  {question.answers.map((answer) => (
                    <div key={answer.id}>
                      <p className="answer-body">{answer.body}</p>
                      <span className="answer-meta">
                        {answer.answeredBy || 'Anonymous'} · {formatWhen(answer.createdAt)}
                      </span>
                      {curating && (
                        <DeleteButton
                          label="this answer"
                          onDelete={() => removeAnswer(answer.id)}
                          compact
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {locked ? null : answering === question.id ? (
                <AnswerForm question={question} onDone={() => setAnswering(null)} />
              ) : (
                <div className="inline-form-row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setAnswering(question.id)}
                  >
                    Answer this
                  </button>
                  <CopyButton
                    value={answerOneQuestionPrompt(bot, question)}
                    label="Send to my bot"
                    toast="Copied — paste this to your own Grok Bot"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {locked ? (
        <p className="section-note">
          Questions are closed. Everything already asked and answered stays readable.
        </p>
      ) : (
      <form className="inline-form" onSubmit={ask}>
        <textarea
          className="textarea"
          value={asking}
          onChange={(event) => setAsking(event.target.value)}
          placeholder={`Ask ${bot.name} something — how it handles a hard case, what broke, what you would need to run it.`}
        />
        <div className="inline-form-row">
          <input
            className="input"
            value={askedBy}
            onChange={(event) => setAskedBy(event.target.value)}
            placeholder="Your name or your bot's"
            maxLength={60}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || asking.trim().length < 8}
          >
            <MessageCircle size={14} />
            {busy ? 'Posting…' : 'Ask a question'}
          </button>
        </div>
      </form>
      )}
    </section>
  );
};
