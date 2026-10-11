import type { MessagingCapabilities, MessagingProvider } from "../messaging";
import type { ChatLink, ExternalUser, StatusMessage, StatusMessageEvent } from "../types";
import { DEMO_USERS } from "./demo";

const FAKE_USER_ID = /^FAKE-[A-Z0-9]+$/;

export interface FakeMessagingOptions {
  users?: readonly ExternalUser[];
  maxGroupSize?: number;
}

// An in-memory messaging tool for tests and offline development. Links point at the reserved
// .invalid domain. post, edit and remove drive the status channel the way people would.
export class FakeMessaging implements MessagingProvider {
  readonly id = "fake";
  readonly label = "Fake chat";
  readonly capabilities: MessagingCapabilities = {
    groupChat: true,
    profiles: true,
    statusHistory: true,
    liveEvents: true,
    reactions: true,
  };
  readonly maxGroupSize: number;
  // What react() was asked to do, newest last, so tests can assert on the feedback loop.
  readonly reactions: { channelId: string; ref: string; reaction: string }[] = [];

  private readonly users: readonly ExternalUser[];
  private readonly messages: StatusMessage[] = [];
  private readonly listeners = new Map<string, Set<(event: StatusMessageEvent) => Promise<void>>>();
  private nextRef = 1;

  constructor(options: FakeMessagingOptions = {}) {
    this.users = options.users ?? DEMO_USERS;
    this.maxGroupSize = options.maxGroupSize ?? 8;
  }

  normalizeUserId(raw: string): string | null {
    const value = raw.trim().toUpperCase();
    return FAKE_USER_ID.test(value) ? value : null;
  }

  async matchUsers(emails: string[]): Promise<Map<string, string>> {
    const byEmail = new Map(this.users.map((u) => [u.email.toLowerCase(), u.externalId]));
    const matches = new Map<string, string>();
    for (const email of emails) {
      const id = byEmail.get(email.trim().toLowerCase());
      if (id) matches.set(email.trim().toLowerCase(), id);
    }
    return matches;
  }

  personLink(userId: string): ChatLink | null {
    return { web: `https://chat.invalid/users/${encodeURIComponent(userId)}` };
  }

  channelLink(channelId: string): ChatLink | null {
    return { web: `https://chat.invalid/channels/${encodeURIComponent(channelId)}` };
  }

  async listProfiles(): Promise<ExternalUser[]> {
    return this.users.map((u) => ({ ...u }));
  }

  async openGroupChat(viewerToken: string, userIds: string[]): Promise<ChatLink> {
    if (viewerToken === "") throw new Error("A group chat needs the viewer's token");
    const ids = [...new Set(userIds)];
    if (ids.length < 2 || ids.length > this.maxGroupSize) {
      throw new Error(`A group chat takes 2 to ${this.maxGroupSize} people`);
    }
    return { web: `https://chat.invalid/groups/${ids.sort().join(",")}` };
  }

  async statusHistory(channelId: string, since: Date): Promise<StatusMessage[]> {
    return this.messages
      .filter((m) => m.channelId === channelId && (m.editedAt ?? m.postedAt) >= since)
      .sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime())
      .map((m) => ({ ...m }));
  }

  async listen(channelId: string, onEvent: (event: StatusMessageEvent) => Promise<void>) {
    const set = this.listeners.get(channelId) ?? new Set();
    set.add(onEvent);
    this.listeners.set(channelId, set);
    return async () => {
      set.delete(onEvent);
    };
  }

  async react(message: { channelId: string; ref: string }, reaction: string): Promise<void> {
    this.reactions.push({ ...message, reaction });
  }

  // Posts a message to a channel as `authorId` and tells listeners. Returns the message.
  async post(
    channelId: string,
    authorId: string,
    text: string,
    at = new Date(),
  ): Promise<StatusMessage> {
    const message: StatusMessage = {
      channelId,
      ref: `m${this.nextRef++}`,
      authorId,
      text,
      postedAt: at,
    };
    this.messages.push(message);
    await this.emit(channelId, { type: "posted", message: { ...message } });
    return message;
  }

  async edit(channelId: string, ref: string, text: string, at = new Date()): Promise<void> {
    const message = this.messages.find((m) => m.channelId === channelId && m.ref === ref);
    if (!message) throw new Error(`No message ${ref} in ${channelId}`);
    message.text = text;
    message.editedAt = at;
    await this.emit(channelId, { type: "edited", message: { ...message } });
  }

  async remove(channelId: string, ref: string): Promise<void> {
    const index = this.messages.findIndex((m) => m.channelId === channelId && m.ref === ref);
    if (index === -1) throw new Error(`No message ${ref} in ${channelId}`);
    this.messages.splice(index, 1);
    await this.emit(channelId, { type: "deleted", channelId, ref });
  }

  private async emit(channelId: string, event: StatusMessageEvent) {
    for (const listener of this.listeners.get(channelId) ?? []) await listener(event);
  }
}
