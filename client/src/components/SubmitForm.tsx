import React, { useState } from 'react';
import { AlertCircle, Info, Lock } from 'lucide-react';
import { DEFAULT_COLOR, DEFAULT_SHAPE } from '../lib/appearance';
import { type FieldErrors, addBot, validateBot } from '../lib/store';
import { useLocked } from '../lib/lock';
import { Link, navigate } from '../lib/router';
import { BotFields, type BotDraft } from './BotFields';
import { CopyButton } from './CopyBlock';
import { addYourselfPrompt } from '../lib/prompts';
import { showToast } from './Toast';

const EMPTY: BotDraft = {
  name: '',
  owner: '',
  description: '',
  color: DEFAULT_COLOR,
  shape: DEFAULT_SHAPE,
};

export const SubmitForm: React.FC = () => {
  const [draft, setDraft] = useState<BotDraft>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const locked = useLocked();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    const result = validateBot(draft);
    if (!result.ok) {
      setErrors(result.errors);
      showToast('Have another look at the form');
      setSubmitting(false);
      return;
    }

    setErrors({});
    // Writes straight into the synced store, so every open tab sees it appear.
    const id = addBot(result.value);
    showToast(`${result.value.name} added to the showcase`);
    navigate(`/bot/${id}`);
  };

  if (locked) {
    return (
      <section className="form-page">
        <div className="shell-narrow">
          <div className="empty-state">
            <Lock size={20} />
            <h3>The showcase is closed</h3>
            <p>
              No new bots can be added, and existing entries cannot be changed. Everything
              already here is still readable.
            </p>
            <Link to="/" className="btn btn-primary">
              Browse the showcase
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="form-page">
      <div className="shell-narrow">
        <div className="form-intro">
          <span className="eyebrow">Add a bot</span>
          <h1 className="display-2">What job does it do?</h1>
          <p className="lede">
            A name and a description. The description is the part other people and their
            bots will read, so explain how it works and why that has been useful.
          </p>
        </div>

        <div className="callout" style={{ marginBottom: 32 }}>
          <Info size={16} />
          <div>
            Running a Grok Bot? It can fill this in itself — hand it this instruction and it
            will come here and add its own entry.
            <div className="callout-action">
              <CopyButton
                value={addYourselfPrompt()}
                label="Copy the prompt"
                toast="Copied — paste this to your own Grok Bot"
              />
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <BotFields
            draft={draft}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            errors={errors}
          />

          {errors.form && (
            <p className="field-error" style={{ marginBottom: 16 }}>
              <AlertCircle size={13} />
              {errors.form}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add to the showcase'}
          </button>
          <p className="field-hint" style={{ marginTop: 12 }}>
            You can edit or remove it afterwards from its own page — nothing here is
            permanent.
          </p>
        </form>
      </div>
    </section>
  );
};
