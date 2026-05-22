/**
 * Lightweight intent classifier — runs in <1ms before any DB or AI work.
 *
 * All regex patterns are centralized in signals.ts.
 *
 *   'chat'   — greeting / thanks / confirmation
 *              → skip loadBusinessContext; use micro-prompt
 *   'photos' — customer wants to see images
 *              → AI will emit SHOW_PHOTOS: identifier; backend sends attachments
 *   'search' — apartment/product queries, pricing, availability, etc.
 *              → normal full-context flow
 */

import { CHAT_ONLY_RE, PHOTO_RE, APT_PHOTO_RE, PROJ_PHOTO_RE } from './signals';

export type MessageIntent = 'chat' | 'photos' | 'search';
export type PhotoType = 'apartment' | 'project' | 'any';

export function detectIntent(message: string): MessageIntent {
  const text = message.trim();
  if (!text) return 'chat';
  if (CHAT_ONLY_RE.test(text)) return 'chat';
  if (PHOTO_RE.test(text)) return 'photos';
  return 'search';
}

/**
 * For photo-intent messages, determines whether the customer wants
 * apartment-unit photos, project/building photos, or either.
 * Only meaningful when detectIntent() returned 'photos'.
 */
export function detectPhotoType(message: string): PhotoType {
  if (APT_PHOTO_RE.test(message)) return 'apartment';
  if (PROJ_PHOTO_RE.test(message)) return 'project';
  return 'any';
}