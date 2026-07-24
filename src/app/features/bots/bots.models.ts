/**
 * Types mirrored from
 * `zira-server/apps/api-gateway/src/modules/telegram-bot/dtos/admin-bot-binding.response.ts`
 * and `admin-bot-bindings-query.dto.ts`. This inventory is DB-only tooling: it
 * reads/force-unlinks the `*_bot_project_chat` binding rows and never calls a
 * Bot API. Raw Bot-API operations (webhook, identity, chat tools, …) live in
 * the separate `zira-bot-console` app.
 */

export type BotBindingPlatform = 'zalo' | 'telegram';
export const BOT_BINDING_PLATFORMS: readonly BotBindingPlatform[] = ['zalo', 'telegram'];

/**
 * `active` = still linked (`disconnectedAt === null`); `disconnected` = severed.
 * Matches the server's `disconnected_at`-based filter, not the raw `status` column.
 */
export type BotBindingStatusFilter = 'active' | 'disconnected';
export const BOT_BINDING_STATUS_FILTERS: readonly BotBindingStatusFilter[] = [
  'active',
  'disconnected',
];

/** One row of the unified Zalo/Telegram group↔project binding inventory. */
export interface AdminBotBindingResponse {
  platform: BotBindingPlatform;
  id: string;
  projectId: string;
  /** Resolved at read time; null if the project itself was deleted (orphaned binding). */
  projectName: string | null;
  chatId: string;
  displayName: string;
  /** Zira user who created the binding; null for cascade-orphaned rows. */
  linkedByUserId: string | null;
  /** Raw binding status (`linked` | `disconnected`). */
  status: string;
  linkedAt: string;
  disconnectedAt: string | null;
}

export interface AdminBotBindingFilter {
  platform?: BotBindingPlatform;
  projectId?: string;
  status?: BotBindingStatusFilter;
}
