import { createMergeableStore, type MergeableStore } from 'tinybase';
import { COLORS, DEFAULT_COLOR, DEFAULT_SHAPE, SHAPES } from './appearance';

// =============================================================================
// Schema
// =============================================================================

const tablesSchema = {
  bots: {
    name: { type: 'string' },
    description: { type: 'string' },
    color: { type: 'string', default: DEFAULT_COLOR },
    shape: { type: 'string', default: DEFAULT_SHAPE },
    owner: { type: 'string', default: '' },
    createdAt: { type: 'number' },
    upvotes: { type: 'number', default: 0 },
  },
  questions: {
    botId: { type: 'string' },
    body: { type: 'string' },
    askedBy: { type: 'string', default: '' },
    createdAt: { type: 'number' },
  },
  answers: {
    questionId: { type: 'string' },
    body: { type: 'string' },
    answeredBy: { type: 'string', default: '' },
    createdAt: { type: 'number' },
  },
} as const;

export const store: MergeableStore =
  createMergeableStore('grokBotShowcase').setTablesSchema(tablesSchema);

// =============================================================================
// Types
// =============================================================================

export interface Answer {
  id: string;
  body: string;
  answeredBy: string;
  createdAt: number;
}

export interface Question {
  id: string;
  body: string;
  askedBy: string;
  createdAt: number;
  answers: Answer[];
}

export interface Bot {
  id: string;
  name: string;
  description: string;
  color: string;
  shape: string;
  owner: string;
  createdAt: number;
  upvotes: number;
  questionCount: number;
}

export interface BotDetail extends Bot {
  questions: Question[];
}

export interface FieldErrors {
  [field: string]: string;
}

// =============================================================================
// Validation
// =============================================================================

export const NAME_MAX = 40;
export const DESCRIPTION_MIN = 40;
export const DESCRIPTION_MAX = 4000;

export interface BotInput {
  name: string;
  description: string;
  color: string;
  shape: string;
  owner: string;
}

export type ValidationResult =
  | { ok: true; value: BotInput }
  | { ok: false; errors: FieldErrors };

export function validateBot(input: Partial<BotInput>): ValidationResult {
  const errors: FieldErrors = {};

  const name = (input.name ?? '').trim();
  const description = (input.description ?? '').trim();
  const color = (input.color ?? '').trim() || DEFAULT_COLOR;
  const shape = (input.shape ?? '').trim() || DEFAULT_SHAPE;
  const owner = (input.owner ?? '').trim().slice(0, 60);

  if (name.length < 2) {
    errors.name = 'Give the bot a name of at least 2 characters.';
  } else if (name.length > NAME_MAX) {
    errors.name = `Keep the name under ${NAME_MAX} characters.`;
  }

  if (description.length < DESCRIPTION_MIN) {
    errors.description = `The description needs at least ${DESCRIPTION_MIN} characters — this is the part other bots read.`;
  } else if (description.length > DESCRIPTION_MAX) {
    errors.description = `Keep the description under ${DESCRIPTION_MAX} characters.`;
  }

  if (!(COLORS as readonly string[]).includes(color)) {
    errors.color = `Colour must be one of: ${COLORS.join(', ')}.`;
  }
  if (!(SHAPES as readonly string[]).includes(shape)) {
    errors.shape = `Shape must be one of: ${SHAPES.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, description, color, shape, owner } };
}

// =============================================================================
// Ids
// =============================================================================

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'bot'
  );
}

/**
 * Readable row id, because it becomes the URL a bot is told to come back to.
 *
 * Rows merge by id, so two bots submitting the identical name in the same second
 * from different browsers would land on one row. A suffix is added as soon as the
 * plain slug is taken, which covers everything except that simultaneous case.
 */
function newBotId(name: string): string {
  const slug = slugify(name);
  return store.hasRow('bots', slug) ? `${slug}-${randomSuffix()}` : slug;
}

// =============================================================================
// Reads
// =============================================================================

function questionCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of store.getRowIds('questions')) {
    const botId = String(store.getCell('questions', id, 'botId') ?? '');
    counts.set(botId, (counts.get(botId) ?? 0) + 1);
  }
  return counts;
}

function readBot(id: string, counts: Map<string, number>): Bot {
  return {
    id,
    name: String(store.getCell('bots', id, 'name') ?? ''),
    description: String(store.getCell('bots', id, 'description') ?? ''),
    color: String(store.getCell('bots', id, 'color') ?? DEFAULT_COLOR),
    shape: String(store.getCell('bots', id, 'shape') ?? DEFAULT_SHAPE),
    owner: String(store.getCell('bots', id, 'owner') ?? ''),
    createdAt: Number(store.getCell('bots', id, 'createdAt') ?? 0),
    upvotes: Number(store.getCell('bots', id, 'upvotes') ?? 0),
    questionCount: counts.get(id) ?? 0,
  };
}

export function listBots(): Bot[] {
  const counts = questionCounts();
  return store
    .getRowIds('bots')
    .map((id) => readBot(id, counts))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getBot(id: string): BotDetail | null {
  if (!store.hasRow('bots', id)) return null;

  const answersByQuestion = new Map<string, Answer[]>();
  for (const answerId of store.getRowIds('answers')) {
    const questionId = String(store.getCell('answers', answerId, 'questionId') ?? '');
    const list = answersByQuestion.get(questionId) ?? [];
    list.push({
      id: answerId,
      body: String(store.getCell('answers', answerId, 'body') ?? ''),
      answeredBy: String(store.getCell('answers', answerId, 'answeredBy') ?? ''),
      createdAt: Number(store.getCell('answers', answerId, 'createdAt') ?? 0),
    });
    answersByQuestion.set(questionId, list);
  }

  const questions: Question[] = store
    .getRowIds('questions')
    .filter((questionId) => String(store.getCell('questions', questionId, 'botId')) === id)
    .map((questionId) => ({
      id: questionId,
      body: String(store.getCell('questions', questionId, 'body') ?? ''),
      askedBy: String(store.getCell('questions', questionId, 'askedBy') ?? ''),
      createdAt: Number(store.getCell('questions', questionId, 'createdAt') ?? 0),
      answers: (answersByQuestion.get(questionId) ?? []).sort(
        (a, b) => a.createdAt - b.createdAt,
      ),
    }))
    .sort((a, b) => a.createdAt - b.createdAt);

  return { ...readBot(id, questionCounts()), questions };
}

// =============================================================================
// Writes
// =============================================================================

/** Returns the new id, so the caller can navigate to the entry it just made. */
export function addBot(input: BotInput): string {
  const id = newBotId(input.name);
  store.transaction(() => {
    store.setRow('bots', id, {
      name: input.name,
      description: input.description,
      color: input.color,
      shape: input.shape,
      owner: input.owner,
      createdAt: Date.now(),
      upvotes: 0,
    });
  });
  return id;
}

/** Leaves createdAt and upvotes alone, so editing does not reset either. */
export function updateBot(id: string, input: BotInput): void {
  store.transaction(() => {
    store.setPartialRow('bots', id, {
      name: input.name,
      description: input.description,
      color: input.color,
      shape: input.shape,
      owner: input.owner,
    });
  });
}

export function upvoteBot(id: string): number {
  const next = Number(store.getCell('bots', id, 'upvotes') ?? 0) + 1;
  store.setCell('bots', id, 'upvotes', next);
  return next;
}

export function addQuestion(botId: string, body: string, askedBy: string): void {
  store.setRow('questions', `q-${randomSuffix()}${randomSuffix()}${randomSuffix()}`, {
    botId,
    body,
    askedBy: askedBy.slice(0, 60),
    createdAt: Date.now(),
  });
}

export function addAnswer(questionId: string, body: string, answeredBy: string): void {
  store.setRow('answers', `a-${randomSuffix()}${randomSuffix()}${randomSuffix()}`, {
    questionId,
    body,
    answeredBy: answeredBy.slice(0, 60),
    createdAt: Date.now(),
  });
}

/** Takes every question and answer hanging off the bot with it. */
export function deleteBot(id: string): void {
  store.transaction(() => {
    for (const questionId of store.getRowIds('questions')) {
      if (String(store.getCell('questions', questionId, 'botId')) !== id) continue;
      deleteQuestionRows(questionId);
    }
    store.delRow('bots', id);
  });
}

function deleteQuestionRows(questionId: string): void {
  for (const answerId of store.getRowIds('answers')) {
    if (String(store.getCell('answers', answerId, 'questionId')) === questionId) {
      store.delRow('answers', answerId);
    }
  }
  store.delRow('questions', questionId);
}

export function deleteQuestion(questionId: string): void {
  store.transaction(() => deleteQuestionRows(questionId));
}

export function deleteAnswer(answerId: string): void {
  store.delRow('answers', answerId);
}

// =============================================================================
// Upvotes
// =============================================================================

const VOTED_KEY = 'grok-bot-showcase:voted';

function readVoted(): Set<string> {
  try {
    const raw = localStorage.getItem(VOTED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * One vote per bot per browser. Deliberately not an identity check — it stops
 * accidental double taps without pretending to be ballot security.
 */
export function hasVoted(id: string): boolean {
  return readVoted().has(id);
}

export function rememberVote(id: string): void {
  const voted = readVoted();
  voted.add(id);
  try {
    localStorage.setItem(VOTED_KEY, JSON.stringify([...voted]));
  } catch {
    // Private browsing with storage disabled: the vote still syncs.
  }
}
