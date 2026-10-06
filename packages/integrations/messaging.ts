import type { ChatLink, ExternalUser, StatusMessage, StatusMessageEvent } from "./types";

// What a messaging provider can do beyond the required methods. Each flag is true exactly when the
// matching optional method exists (the contract suite checks this), so the UI and jobs decide what
// to show and run from the flags alone.
export interface MessagingCapabilities {
  // openGroupChat, with maxGroupSize other people at most.
  groupChat: boolean;
  // listProfiles: photos and titles for the directory (plan.md Phase 7 #3).
  profiles: boolean;
  // statusHistory: reading a status channel, for presence keywords and backfill.
  statusHistory: boolean;
  // listen: live status-channel events, from a connection the worker holds open.
  liveEvents: boolean;
  // react: acknowledging a status message the rules understood.
  reactions: boolean;
}

export interface MessagingProvider {
  // The value of MESSAGING_PROVIDER, and the provider id stored with person_identity and
  // presence_signal rows.
  readonly id: string;
  readonly label: string;
  readonly capabilities: MessagingCapabilities;
  // The largest group chat openGroupChat accepts, not counting the viewer; 0 without groupChat.
  readonly maxGroupSize: number;

  // The stored form of a user id, or null if it isn't one this provider issues.
  normalizeUserId(raw: string): string | null;
  // Email → user id, for the people the tool knows. Matching ignores the case of the email; the
  // returned keys are lowercased.
  matchUsers(emails: string[]): Promise<Map<string, string>>;
  // Links that need no API call, or null when the tool has no way to open them.
  personLink(userId: string): ChatLink | null;
  channelLink(channelId: string): ChatLink | null;

  listProfiles?(): Promise<ExternalUser[]>;
  // Opens (or finds) a group chat as the viewer, with their own token from messaging_user_token.
  openGroupChat?(viewerToken: string, userIds: string[]): Promise<ChatLink>;
  // Messages posted or edited since `since`, oldest first.
  statusHistory?(channelId: string, since: Date): Promise<StatusMessage[]>;
  // Calls onEvent for each change in the channel until the returned stop function is called.
  listen?(
    channelId: string,
    onEvent: (event: StatusMessageEvent) => Promise<void>,
  ): Promise<() => Promise<void>>;
  // `reaction` is a Unicode emoji; the adapter maps it to the tool's own reaction name.
  react?(message: { channelId: string; ref: string }, reaction: string): Promise<void>;
}

export const NO_MESSAGING_CAPABILITIES: MessagingCapabilities = {
  groupChat: false,
  profiles: false,
  statusHistory: false,
  liveEvents: false,
  reactions: false,
};

// What the configured provider supports; everything is off when none is configured.
export function messagingCapabilities(provider: MessagingProvider | null): MessagingCapabilities {
  return provider?.capabilities ?? NO_MESSAGING_CAPABILITIES;
}
