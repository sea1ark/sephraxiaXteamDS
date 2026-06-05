// Shared TypeScript types used by both the client and the server.
// These mirror the Prisma models but are framework-agnostic (no Prisma imports),
// so the renderer can use them without pulling in server dependencies.

export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';
export type ChannelType = 'text' | 'voice';

export interface User {
  id: string;
  username: string;
  avatarUrl: string | null;
  status: UserStatus;
  isOwner: boolean;
  createdAt: string; // ISO string over the wire
  mutedUntil?: string | null; // timeout expiry (ISO); null/absent = not timed out
}

/** A User as exposed publicly (never includes passwordHash). */
export interface PublicUser extends User {
  roles?: Role[]; // populated where the server joins roles
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  position: number;
}

/** A file attached to a message (image rendered inline, others as a chip). */
export interface Attachment {
  url: string;
  name: string;
  type: string; // MIME type, e.g. "image/png"
  size: number; // bytes
}

/** Lightweight preview of a message being replied to. */
export interface ReplyPreview {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
}

export interface Message {
  id: string;
  content: string;
  authorId: string;
  channelId: string;
  createdAt: string;
  editedAt: string | null;
  attachments?: Attachment[];
  replyToId?: string | null;
  replyTo?: ReplyPreview | null;
  author?: PublicUser; // populated when the server joins the author
}

export interface DirectMessage {
  id: string;
  content: string;
  fromId: string;
  toId: string;
  createdAt: string;
  editedAt?: string | null;
  attachments?: Attachment[];
  replyToId?: string | null;
  replyTo?: ReplyPreview | null;
  from?: PublicUser; // populated when the server joins the sender
}

/** A DM conversation partner with the most recent message preview. */
export interface DmConversation {
  user: PublicUser;
  lastMessage: DirectMessage | null;
}

export interface RolePermissions {
  canManageChannels: boolean;
  canDeleteMessages: boolean;
  canManageRoles: boolean;
  canKick: boolean;
  canBan: boolean;
  canTimeout: boolean;
}

export interface Role extends RolePermissions {
  id: string;
  name: string;
  color: string;
  symbol: string;
  position: number;
}

export interface CreateRolePayload extends Partial<RolePermissions> {
  name: string;
  color: string;
  symbol: string;
}

/** Effective permissions for a user (union of their roles; owner = all true). */
export interface EffectivePermissions extends RolePermissions {
  isOwner: boolean;
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export interface FriendRequest {
  id: string;
  user: PublicUser; // the other party (requester for incoming, addressee for outgoing)
  createdAt: string;
}

export interface FriendsData {
  friends: PublicUser[];
  incoming: FriendRequest[]; // requests waiting on me to accept
  outgoing: FriendRequest[]; // requests I sent, awaiting the other side
}

// ---------------------------------------------------------------------------
// Auth payloads
// ---------------------------------------------------------------------------

export interface AuthCredentials {
  username: string;
  password: string;
}

/** Fields a user may edit on their own profile. */
export interface UpdateProfilePayload {
  avatarUrl?: string | null;
  status?: Exclude<UserStatus, 'offline'>; // can't manually set yourself offline
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: PublicUser;
}

/** Decoded JWT access-token payload. */
export interface JwtPayload {
  sub: string; // user id
  username: string;
}

// ---------------------------------------------------------------------------
// Socket.io event contracts
// ---------------------------------------------------------------------------

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  'message:send': (payload: {
    channelId: string;
    content: string;
    attachments?: Attachment[];
    replyToId?: string | null;
  }) => void;
  'message:edit': (payload: { messageId: string; content: string }) => void;
  'message:delete': (payload: { messageId: string }) => void;
  'dm:send': (payload: {
    toId: string;
    content: string;
    attachments?: Attachment[];
    replyToId?: string | null;
  }) => void;
  'dm:edit': (payload: { dmId: string; content: string }) => void;
  'dm:delete': (payload: { dmId: string }) => void;
  'typing:start': (payload: { channelId: string }) => void;
  'typing:stop': (payload: { channelId: string }) => void;
  // --- Voice (WebRTC mesh signaling) ---
  'voice:join': (payload: { channelId: string }) => void;
  'voice:leave': (payload: { channelId: string }) => void;
  // Relay an SDP offer/answer or ICE candidate to another participant. `data`
  // is opaque to the server (RTCSessionDescriptionInit | RTCIceCandidateInit).
  'voice:signal': (payload: { channelId: string; toUserId: string; data: VoiceSignal }) => void;
  'voice:state': (payload: { channelId: string; muted: boolean }) => void;
}

/** Opaque WebRTC signaling payload relayed between peers. */
export type VoiceSignal =
  | { kind: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: unknown };

/** Per-channel voice participant with their current mute state. */
export interface VoiceParticipant {
  userId: string;
  muted: boolean;
}

/** Events the server emits to the client. */
export interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'message:update': (message: Message) => void;
  'message:delete': (payload: { messageId: string; channelId: string }) => void;
  'dm:new': (message: DirectMessage) => void;
  'dm:update': (message: DirectMessage) => void;
  'dm:delete': (payload: { id: string; fromId: string; toId: string }) => void;
  'user:online': (payload: { userId: string; status: UserStatus }) => void;
  'user:offline': (payload: { userId: string }) => void;
  // Emitted when a user changes status (idle/dnd/online), edits their profile,
  // is timed out, or has their roles changed.
  'user:update': (user: PublicUser) => void;
  // Emitted when roles are created/edited/deleted so clients can refresh.
  'roles:changed': () => void;
  // Emitted when channels are created/renamed/deleted so clients can refresh.
  'channels:changed': () => void;
  // Emitted to both parties when a friend request / friendship changes.
  'friends:changed': () => void;
  // Sent to a user who has just been kicked or banned (force logout).
  'moderation:enforced': (payload: { action: 'kick' | 'ban'; reason?: string }) => void;
  'typing:start': (payload: { channelId: string; userId: string }) => void;
  'typing:stop': (payload: { channelId: string; userId: string }) => void;
  // --- Voice ---
  // Sent to a joiner: the participants already in the channel they should dial.
  'voice:peers': (payload: { channelId: string; participants: VoiceParticipant[] }) => void;
  // Broadcast to everyone so channel lists can show who is in voice.
  'voice:joined': (payload: { channelId: string; userId: string }) => void;
  'voice:left': (payload: { channelId: string; userId: string }) => void;
  // Targeted relay of a peer's signaling data.
  'voice:signal': (payload: { channelId: string; fromUserId: string; data: VoiceSignal }) => void;
  // A participant toggled mute.
  'voice:state': (payload: { channelId: string; userId: string; muted: boolean }) => void;
  // Full voice membership snapshot, sent on connect.
  'voice:snapshot': (payload: { channels: Record<string, VoiceParticipant[]> }) => void;
}
