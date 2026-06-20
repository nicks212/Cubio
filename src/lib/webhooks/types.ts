// ============================================================
// Shared Webhook Types
// ============================================================

import type { BusinessType } from '@/types/database';

export type Provider = 'facebook' | 'instagram' | 'telegram' | 'whatsapp' | 'viber';

/** Normalized message format — shared across all providers */
export interface NormalizedMessage {
  provider: Provider;
  /** The provider account ID used to look up the integration (page_id, bot_id, phone_number_id, etc.) */
  providerAccountId: string;
  /** The sender's unique ID within the provider */
  senderId: string;
  /** Display name of sender, if available */
  senderName: string | null;
  /** The text content of the message */
  messageText: string;
  /** Optional image URL sent by the customer (used for multimodal AI recommendations) */
  imageUrl?: string | null;
  /**
   * Voice/audio message identifier — set when the customer sends a voice note.
   * Meta (Instagram/Facebook): direct download URL from the attachment payload.
   * WhatsApp: media ID (resolved to URL via Graph API in the processing pipeline).
   * Telegram: file_id (resolved to URL via Bot API in the processing pipeline).
   */
  audioFileId?: string | null;
  /** Provider-assigned message ID (e.g. Facebook mid) — used for idempotency / dedup */
  messageId?: string | null;
  /** Raw provider payload for debugging / fallback */
  rawPayload: Record<string, unknown>;
}

/** Resolved integration + company data from DB */
export interface ResolvedIntegration {
  integrationId: string;
  companyId: string;
  businessType: BusinessType;
  aiEnabled: boolean;
  accessToken: string;
  refreshToken: string | null;
  provider: Provider;
  providerAccountId: string;
}

/** Message history entry for AI context */
export interface MessageHistoryEntry {
  role: 'user' | 'agent' | 'ai';
  content: string;
}

/** Result after processing a message through AI */
export interface ProcessResult {
  conversationId: string;
  /** null when AI was skipped (human takeover active or typing debounce) */
  reply: string | null;
}
