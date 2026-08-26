import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { type Color, type Shape } from '../lib/appearance';
import {
  type BotDetail,
  type FieldErrors,
  updateBot,
  validateBot,
} from '../lib/store';
import { BotFields, type BotDraft } from './BotFields';
import { showToast } from './Toast';

/**
 * Editing is open to anyone, on purpose: a person who posted something they
 * regret should be able to fix it in seconds without finding an admin.
 */
export const EditBot: React.FC<{ bot: BotDetail; onDone: () => void }> = ({
  bot,
  onDone,
}) => {
  const [draft, setDraft] = useState<BotDraft>({
    name: bot.name,
    owner: bot.owner,
    description: bot.description,
    color: bot.color as Color,
    shape: bot.shape as Shape,
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateBot(draft);
    if (!result.ok) {
      setErrors(result.errors);
      showToast('Have another look at the form');
      return;
    }

    setErrors({});
    updateBot(bot.id, result.value);
    showToast('Changes saved');
    onDone();
  };

  return (
    <form className="edit-panel" onSubmit={save} noValidate>
      <h2 className="section-title">Editing {bot.name}</h2>
      <p className="section-note">
        Anyone can tidy up an entry. Changes appear on everyone's screen straight away.
      </p>

      <BotFields
        draft={draft}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        errors={errors}
        idPrefix="edit-"
      />

      {errors.form && (
        <p className="field-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={13} />
          {errors.form}
        </p>
      )}

      <div className="inline-form-row">
        <button type="submit" className="btn btn-primary">
          Save changes
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
};
