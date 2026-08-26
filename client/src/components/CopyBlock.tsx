import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { showToast } from './Toast';

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

interface CopyButtonProps {
  value: string;
  label?: string;
  toast?: string;
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  label = 'Copy',
  toast,
  className = 'copy-btn',
}) => {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    if (!(await writeClipboard(value))) {
      showToast('Could not reach the clipboard — select the text and copy it');
      return;
    }
    setCopied(true);
    showToast(toast ?? 'Copied');
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button type="button" className={`${className}${copied ? ' copied' : ''}`} onClick={handleClick}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
};

interface CopyBlockProps {
  label: string;
  value: string;
  toast?: string;
  /** `prose` for human-readable text, `mono` for anything meant to be pasted verbatim. */
  variant?: 'mono' | 'prose';
}

export const CopyBlock: React.FC<CopyBlockProps> = ({ label, value, toast, variant = 'mono' }) => (
  <div className="copy-block">
    <div className="copy-block-head">
      <span className="copy-block-label">{label}</span>
      <CopyButton value={value} toast={toast} />
    </div>
    <div className={`copy-block-body${variant === 'prose' ? ' prose-body' : ''}`}>{value}</div>
  </div>
);
