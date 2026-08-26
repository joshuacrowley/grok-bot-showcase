import React from 'react';
import { AlertCircle } from 'lucide-react';
import { type Color, type Shape } from '../lib/appearance';
import { DESCRIPTION_MIN, type FieldErrors } from '../lib/store';
import { AppearancePicker } from './AppearancePicker';

export interface BotDraft {
  name: string;
  owner: string;
  description: string;
  color: Color;
  shape: Shape;
}

interface BotFieldsProps {
  draft: BotDraft;
  onChange: (patch: Partial<BotDraft>) => void;
  errors: FieldErrors;
  /** Ids are suffixed so the add and edit forms can coexist on one page. */
  idPrefix?: string;
}

/**
 * The fields themselves, shared by adding and editing so the two cannot drift
 * apart in wording or validation.
 */
export const BotFields: React.FC<BotFieldsProps> = ({
  draft,
  onChange,
  errors,
  idPrefix = '',
}) => {
  const id = (field: string) => `${idPrefix}${field}`;
  const shortfall = DESCRIPTION_MIN - draft.description.trim().length;

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor={id('name')}>
          Name
        </label>
        <input
          id={id('name')}
          className={`input${errors.name ? ' invalid' : ''}`}
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="Account Health"
          maxLength={40}
        />
        {errors.name && (
          <p className="field-error">
            <AlertCircle size={13} />
            {errors.name}
          </p>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor={id('owner')}>
          Owner <span className="muted" style={{ fontWeight: 400 }}>— optional</span>
        </label>
        <p className="field-hint">
          The person whose bot this is, so people know who to ask about it. If a bot is
          filling this in, this is your owner's name, not your own.
        </p>
        <input
          id={id('owner')}
          className="input"
          value={draft.owner}
          onChange={(event) => onChange({ owner: event.target.value })}
          placeholder="Josh"
          maxLength={60}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor={id('description')}>
          Description
        </label>
        <p className="field-hint">
          The job it owns, what it reads, what it hands back, and where it stops and waits
          for a person — then why that has been useful.
        </p>
        <textarea
          id={id('description')}
          className={`textarea${errors.description ? ' invalid' : ''}`}
          style={{ minHeight: 200 }}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="You own the weekly account-health review for our top 50 accounts. Read the CRM list, the usage dashboard and the support queue. Each week deliver one ranked table… Never contact a customer without approval. This has been useful because nobody rebuilds that table by hand on a Monday any more, and the accounts that are drifting show up a week earlier than they used to."
        />
        <div className="field-foot">
          <span>
            {shortfall > 0
              ? `${shortfall} more character${shortfall === 1 ? '' : 's'} to go`
              : `${draft.description.trim().length} characters`}
          </span>
        </div>
        {errors.description && (
          <p className="field-error">
            <AlertCircle size={13} />
            {errors.description}
          </p>
        )}
      </div>

      <div className="field">
        <span className="field-label">Look</span>
        <p className="field-hint">Pick a shape and a colour so it stands out in the grid.</p>
        <AppearancePicker
          color={draft.color}
          shape={draft.shape}
          onColorChange={(color) => onChange({ color })}
          onShapeChange={(shape) => onChange({ shape })}
        />
      </div>
    </>
  );
};
