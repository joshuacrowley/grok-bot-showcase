import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, KeyRound, Lock, Trash2, Unlock, X } from 'lucide-react';
import { lock, onOpenCuratorGate, unlock, useCurating } from '../lib/admin';
import { setLocked, useLocked } from '../lib/lock';
import { showToast } from './Toast';

/**
 * Password prompt. Opened from the footer link, and closed on escape or by
 * clicking outside, like any other dialog.
 */
export const CuratorGate: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => onOpenCuratorGate(() => setOpen(true)), []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    setPassword('');
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);

    const result = await unlock(password);
    setBusy(false);

    if (result.ok) {
      showToast('Curating — delete controls are on');
      close();
    } else {
      setError(result.error);
      setPassword('');
      inputRef.current?.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={close} role="presentation">
      <div
        className="modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Curator sign in"
      >
        <button type="button" className="modal-close" onClick={close} aria-label="Close">
          <X size={16} />
        </button>

        <div className="modal-icon">
          <KeyRound size={18} />
        </div>
        <h2 className="modal-title">Curate the showcase</h2>
        <p className="modal-note">
          Enter the password to turn on delete controls for bots, questions and answers.
        </p>

        <form onSubmit={submit}>
          <input
            ref={inputRef}
            type="password"
            className={`input${error ? ' invalid' : ''}`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
          />
          {error && (
            <p className="field-error">
              <AlertCircle size={13} />
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 14 }}
            disabled={busy || !password}
          >
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
};

/**
 * Persistent reminder that deletes are live, plus the switch that freezes the
 * whole showcase. The password is asked for again at that moment rather than
 * kept around, since it is the one action that cannot be undone by a visitor.
 */
export const CuratorBar: React.FC = () => {
  const curating = useCurating();
  const locked = useLocked();
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!curating) return null;

  const apply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    const result = await setLocked(password, !locked);
    setBusy(false);

    if (result.ok) {
      showToast(result.locked ? 'Showcase locked — it is read-only now' : 'Showcase reopened');
      setAsking(false);
      setPassword('');
    } else {
      showToast(result.error);
    }
  };

  return (
    <div className="curator-bar">
      <span className="curator-dot" />
      {locked ? 'Locked — the showcase is read-only' : 'Curating — delete controls are on'}

      {asking ? (
        <form className="curator-bar-form" onSubmit={apply}>
          <input
            type="password"
            className="curator-bar-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            autoFocus
          />
          <button type="submit" className="curator-bar-btn" disabled={busy || !password}>
            {busy ? 'Working…' : locked ? 'Reopen' : 'Lock it'}
          </button>
          <button type="button" className="curator-bar-btn" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button type="button" className="curator-bar-btn" onClick={() => setAsking(true)}>
            {locked ? <Unlock size={12} /> : <Lock size={12} />}
            {locked ? 'Reopen the showcase' : 'Lock the showcase'}
          </button>
          <button
            type="button"
            className="curator-bar-btn"
            onClick={() => {
              lock();
              showToast('Curator controls off');
            }}
          >
            Done
          </button>
        </>
      )}
    </div>
  );
};

interface DeleteButtonProps {
  /** What is being removed, used in the confirm label. */
  label: string;
  onDelete: () => void | Promise<void>;
  compact?: boolean;
}

/**
 * Two-step delete: the first click arms it, the second commits. Avoids a
 * confirm dialog for what is usually a deliberate, repeated action.
 */
export const DeleteButton: React.FC<DeleteButtonProps> = ({ label, onDelete, compact }) => {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const handleClick = async (event: React.MouseEvent) => {
    // Cards wrap their body in a link; deleting must not navigate.
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    if (!armed) {
      setArmed(true);
      return;
    }

    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <button
      type="button"
      className={`delete-btn${armed ? ' armed' : ''}${compact ? ' compact' : ''}`}
      onClick={handleClick}
      title={armed ? 'Click again to confirm' : `Delete ${label}`}
    >
      <Trash2 size={compact ? 12 : 13} />
      {busy ? 'Deleting…' : armed ? 'Confirm' : compact ? '' : 'Delete'}
    </button>
  );
};
