// Chat state: channels, active channel, channel messages, member list, presence,
// typing, roles, and direct-message conversations.
import { create } from 'zustand';
import type {
  Channel,
  DirectMessage,
  DmConversation,
  FriendsData,
  Message,
  PublicUser,
  Role,
  ServerInfo,
} from '@sephraxia/shared';

interface ChatState {
  servers: ServerInfo[];
  activeServerId: string | null;
  channels: Channel[];
  activeChannelId: string | null;
  messagesByChannel: Record<string, Message[]>;
  users: PublicUser[];
  roles: Role[];
  // userId -> set of channelIds where they are currently typing
  typing: Record<string, string[]>;

  // Direct messages
  dmConversations: DmConversation[];
  dmMessagesByUser: Record<string, DirectMessage[]>;
  dmUnread: Record<string, boolean>; // partnerId -> has unseen incoming DMs

  // Friends
  friends: FriendsData | null;

  setServers: (servers: ServerInfo[]) => void;
  setActiveServer: (id: string) => void;
  setChannels: (channels: Channel[]) => void;
  setActiveChannel: (id: string | null) => void;
  setMessages: (channelId: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (channelId: string, messageId: string) => void;

  setUsers: (users: PublicUser[]) => void;
  setUserStatus: (userId: string, status: PublicUser['status']) => void;
  upsertUser: (user: PublicUser) => void;
  setRoles: (roles: Role[]) => void;

  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;

  setDmConversations: (conversations: DmConversation[]) => void;
  setDmMessages: (userId: string, messages: DirectMessage[]) => void;
  addDm: (message: DirectMessage, myId: string | undefined) => void;
  updateDm: (message: DirectMessage, myId: string | undefined) => void;
  removeDm: (payload: { id: string; fromId: string; toId: string }, myId: string | undefined) => void;
  markDmRead: (userId: string) => void;

  setFriends: (friends: FriendsData) => void;
}

/** Pick a default channel for a server: first text channel, else first any. */
function defaultChannelId(channels: Channel[], serverId: string | null): string | null {
  const scoped = serverId ? channels.filter((c) => c.serverId === serverId) : channels;
  return (scoped.find((c) => c.type !== 'voice') ?? scoped[0])?.id ?? null;
}

export const useChatStore = create<ChatState>((set) => ({
  servers: [],
  activeServerId: null,
  channels: [],
  activeChannelId: null,
  messagesByChannel: {},
  users: [],
  roles: [],
  typing: {},
  dmConversations: [],
  dmMessagesByUser: {},
  dmUnread: {},
  friends: null,

  setServers: (servers) =>
    set((s) => ({
      servers,
      // Keep the current selection if it still exists; default to home (first).
      activeServerId: servers.some((x) => x.id === s.activeServerId)
        ? s.activeServerId
        : servers[0]?.id ?? null,
    })),
  setActiveServer: (id) =>
    set((s) => {
      if (s.activeServerId === id) return s;
      return { activeServerId: id, activeChannelId: defaultChannelId(s.channels, id) };
    }),
  setChannels: (channels) =>
    set((s) => {
      const active = channels.some((c) => c.id === s.activeChannelId) ? s.activeChannelId : null;
      return {
        channels,
        activeChannelId: active ?? defaultChannelId(channels, s.activeServerId),
      };
    }),
  // Selecting a channel also follows it to its server, so cross-server jumps
  // (quick switcher / search) land on the right rail entry.
  setActiveChannel: (id) =>
    set((s) => {
      const target = id ? s.channels.find((c) => c.id === id) : undefined;
      return {
        activeChannelId: id,
        activeServerId: target?.serverId ?? s.activeServerId,
      };
    }),
  setMessages: (channelId, messages) =>
    set((s) => ({ messagesByChannel: { ...s.messagesByChannel, [channelId]: messages } })),
  addMessage: (message) =>
    set((s) => {
      const existing = s.messagesByChannel[message.channelId] ?? [];
      if (existing.some((m) => m.id === message.id)) return s;
      return {
        messagesByChannel: {
          ...s.messagesByChannel,
          [message.channelId]: [...existing, message],
        },
      };
    }),
  updateMessage: (message) =>
    set((s) => {
      const existing = s.messagesByChannel[message.channelId];
      if (!existing) return s;
      return {
        messagesByChannel: {
          ...s.messagesByChannel,
          [message.channelId]: existing.map((m) => (m.id === message.id ? message : m)),
        },
      };
    }),
  removeMessage: (channelId, messageId) =>
    set((s) => {
      const existing = s.messagesByChannel[channelId];
      if (!existing) return s;
      return {
        messagesByChannel: {
          ...s.messagesByChannel,
          [channelId]: existing.filter((m) => m.id !== messageId),
        },
      };
    }),

  setUsers: (users) => set({ users }),
  setUserStatus: (userId, status) =>
    set((s) => ({
      users: s.users.map((u) => (u.id === userId ? { ...u, status } : u)),
    })),
  upsertUser: (user) =>
    set((s) => ({
      users: s.users.some((u) => u.id === user.id)
        ? s.users.map((u) => (u.id === user.id ? { ...u, ...user } : u))
        : [...s.users, user],
    })),
  setRoles: (roles) => set({ roles }),

  setTyping: (channelId, userId, isTyping) =>
    set((s) => {
      const current = s.typing[channelId] ?? [];
      const next = isTyping
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((id) => id !== userId);
      return { typing: { ...s.typing, [channelId]: next } };
    }),

  setDmConversations: (conversations) => set({ dmConversations: conversations }),
  setDmMessages: (userId, messages) =>
    set((s) => ({ dmMessagesByUser: { ...s.dmMessagesByUser, [userId]: messages } })),
  addDm: (message, myId) =>
    set((s) => {
      // The conversation partner is whoever isn't me.
      const partnerId = message.fromId === myId ? message.toId : message.fromId;
      const existing = s.dmMessagesByUser[partnerId] ?? [];
      const messages = existing.some((m) => m.id === message.id)
        ? existing
        : [...existing, message];

      // Update the conversation list preview (move/insert partner at top).
      const partnerUser =
        message.from && message.from.id === partnerId
          ? message.from
          : s.dmConversations.find((c) => c.user.id === partnerId)?.user ??
            s.users.find((u) => u.id === partnerId);
      let conversations = s.dmConversations;
      if (partnerUser) {
        const without = conversations.filter((c) => c.user.id !== partnerId);
        conversations = [{ user: partnerUser, lastMessage: message }, ...without];
      }

      // Flag the conversation as unread when the message came from the partner.
      const incoming = !!myId && message.fromId !== myId;
      return {
        dmMessagesByUser: { ...s.dmMessagesByUser, [partnerId]: messages },
        dmConversations: conversations,
        dmUnread: incoming ? { ...s.dmUnread, [partnerId]: true } : s.dmUnread,
      };
    }),
  updateDm: (message, myId) =>
    set((s) => {
      const partnerId = message.fromId === myId ? message.toId : message.fromId;
      const existing = s.dmMessagesByUser[partnerId];
      if (!existing) return s;
      const messages = existing.map((m) => (m.id === message.id ? message : m));
      // Refresh the conversation preview if this was the latest message.
      const conversations = s.dmConversations.map((c) =>
        c.user.id === partnerId && c.lastMessage?.id === message.id
          ? { ...c, lastMessage: message }
          : c,
      );
      return {
        dmMessagesByUser: { ...s.dmMessagesByUser, [partnerId]: messages },
        dmConversations: conversations,
      };
    }),
  removeDm: ({ id, fromId, toId }, myId) =>
    set((s) => {
      const partnerId = fromId === myId ? toId : fromId;
      const existing = s.dmMessagesByUser[partnerId];
      if (!existing) return s;
      const messages = existing.filter((m) => m.id !== id);
      // Fix up the preview if we just removed the last message.
      const conversations = s.dmConversations.map((c) =>
        c.user.id === partnerId && c.lastMessage?.id === id
          ? { ...c, lastMessage: messages[messages.length - 1] ?? null }
          : c,
      );
      return {
        dmMessagesByUser: { ...s.dmMessagesByUser, [partnerId]: messages },
        dmConversations: conversations,
      };
    }),
  markDmRead: (userId) =>
    set((s) =>
      s.dmUnread[userId] ? { dmUnread: { ...s.dmUnread, [userId]: false } } : s,
    ),

  setFriends: (friends) => set({ friends }),
}));
