// Thin REST client. Reads the access token from the auth store on each call and
// transparently retries once after refreshing on a 401.
import type {
  Attachment,
  AuthResponse,
  AuthTokens,
  Channel,
  ConfigPost,
  CreateConfigPayload,
  CreateRolePayload,
  DirectMessage,
  DmConversation,
  EffectivePermissions,
  FriendsData,
  Message,
  PublicUser,
  Role,
  ServerInfo,
  UpdateProfilePayload,
  VeilOverview,
} from '@sephraxia/shared';
import { SERVER_URL } from './config';
import { useAuthStore } from '../store/auth';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  // Only declare a JSON body when we actually send one — Fastify rejects an
  // empty body when Content-Type is application/json (breaks body-less POSTs
  // like accept-friend, kick, unban).
  if (options.body != null) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${SERVER_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry && useAuthStore.getState().refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, false);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${SERVER_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error('refresh failed');
    const tokens = (await res.json()) as AuthTokens;
    useAuthStore.getState().setTokens(tokens);
    return true;
  } catch {
    useAuthStore.getState().logout();
    return false;
  }
}

export const api = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getChannels: (serverId?: string) =>
    request<Channel[]>(`/channels${serverId ? `?serverId=${encodeURIComponent(serverId)}` : ''}`),

  // --- Servers (guilds) ---
  getServers: () => request<ServerInfo[]>('/servers'),
  createServer: (name: string, icon?: string) =>
    request<ServerInfo>('/servers', { method: 'POST', body: JSON.stringify({ name, icon }) }),
  joinServer: (code: string) =>
    request<ServerInfo>('/servers/join', { method: 'POST', body: JSON.stringify({ code }) }),
  addServerMember: (serverId: string, userId: string) =>
    request<{ ok: boolean }>(`/servers/${serverId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  leaveServer: (serverId: string) =>
    request<{ ok: boolean }>(`/servers/${serverId}/leave`, { method: 'POST' }),
  deleteServer: (serverId: string) => request<void>(`/servers/${serverId}`, { method: 'DELETE' }),

  createChannel: (name: string, type: 'text' | 'voice' = 'text', serverId?: string) =>
    request<Channel>('/channels', {
      method: 'POST',
      body: JSON.stringify({ name, type, serverId }),
    }),

  updateChannel: (id: string, data: { name?: string; topic?: string | null }) =>
    request<Channel>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteChannel: (id: string) => request<void>(`/channels/${id}`, { method: 'DELETE' }),

  getMessages: (channelId: string) => request<Message[]>(`/channels/${channelId}/messages`),

  /** History window centred on a message — used to jump to pins/search hits. */
  getMessagesAround: (channelId: string, messageId: string) =>
    request<Message[]>(
      `/channels/${channelId}/messages?around=${encodeURIComponent(messageId)}&limit=60`,
    ),

  getPins: (channelId: string) => request<Message[]>(`/channels/${channelId}/pins`),

  searchMessages: (q: string, channelId?: string) =>
    request<Message[]>(
      `/search/messages?q=${encodeURIComponent(q)}${channelId ? `&channelId=${channelId}` : ''}`,
    ),

  getUsers: () => request<PublicUser[]>('/users'),

  getUser: (id: string) => request<PublicUser>(`/users/${id}`),

  updateProfile: (data: UpdateProfilePayload) =>
    request<PublicUser>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

  getPermissions: (serverId?: string) =>
    request<EffectivePermissions>(
      `/users/me/permissions${serverId ? `?serverId=${serverId}` : ''}`,
    ),

  // Avatar file upload (multipart). Returns the updated user.
  uploadAvatar: async (file: File): Promise<PublicUser> => {
    const { accessToken } = useAuthStore.getState();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${SERVER_URL}/users/me/avatar`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error ?? 'upload failed');
    }
    return res.json() as Promise<PublicUser>;
  },

  // Banner file upload (multipart). Returns the updated user.
  uploadBanner: async (file: File): Promise<PublicUser> => {
    const { accessToken } = useAuthStore.getState();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${SERVER_URL}/users/me/banner`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error ?? 'upload failed');
    }
    return res.json() as Promise<PublicUser>;
  },

  // Owner-only: change a user's public UID.
  setUserUid: (id: string, uid: number) =>
    request<PublicUser>(`/users/${id}/uid`, { method: 'PATCH', body: JSON.stringify({ uid }) }),

  // Admin-granted prefix badge (owner / canManageRoles). null clears it.
  setUserBadge: (id: string, badge: string | null, badgeColor?: string | null) =>
    request<PublicUser>(`/users/${id}/badge`, {
      method: 'PATCH',
      body: JSON.stringify({ badge, badgeColor }),
    }),

  // Upload an arbitrary file as a message attachment; returns its metadata.
  uploadFile: async (file: File): Promise<Attachment> => {
    const { accessToken } = useAuthStore.getState();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${SERVER_URL}/uploads`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error ?? 'upload failed');
    }
    return res.json() as Promise<Attachment>;
  },

  // Roles (server-scoped)
  getRoles: (serverId?: string) =>
    request<Role[]>(`/roles${serverId ? `?serverId=${serverId}` : ''}`),
  createRole: (data: CreateRolePayload & { serverId?: string }) =>
    request<Role>('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id: string, data: Partial<CreateRolePayload>) =>
    request<Role>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRole: (id: string) => request<void>(`/roles/${id}`, { method: 'DELETE' }),
  setUserRoles: (userId: string, roleIds: string[], serverId?: string) =>
    request<PublicUser>(`/users/${userId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds, serverId }),
    }),

  // Config / lua library
  getConfigs: (filters?: { project?: string; category?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filters?.project) p.set('project', filters.project);
    if (filters?.category) p.set('category', filters.category);
    if (filters?.q) p.set('q', filters.q);
    const qs = p.toString();
    return request<ConfigPost[]>(`/configs${qs ? `?${qs}` : ''}`);
  },
  getConfigProjects: () => request<{ project: string; count: number }[]>('/configs/projects'),
  createConfig: (data: CreateConfigPayload) =>
    request<ConfigPost>('/configs', { method: 'POST', body: JSON.stringify(data) }),
  bumpConfigDownload: (id: string) =>
    request<{ downloads: number }>(`/configs/${id}/download`, { method: 'POST' }),
  deleteConfig: (id: string) => request<void>(`/configs/${id}`, { method: 'DELETE' }),

  // VeilSight (owner-only)
  veilOverview: () => request<VeilOverview>('/veilsight/overview'),
  veilSetOwner: (id: string, owner: boolean) =>
    request<{ ok: boolean }>(`/veilsight/users/${id}/owner`, {
      method: 'POST',
      body: JSON.stringify({ owner }),
    }),
  veilShadowJoin: (serverId: string) =>
    request<{ ok: boolean }>(`/veilsight/servers/${serverId}/shadow-join`, { method: 'POST' }),
  veilBroadcast: (text: string, targetId?: string | null) =>
    request<{ ok: boolean }>('/veilsight/broadcast', {
      method: 'POST',
      body: JSON.stringify({ text, targetId: targetId ?? null }),
    }),
  veilYank: (id: string) =>
    request<{ ok: boolean }>(`/veilsight/users/${id}/yank`, { method: 'POST' }),

  // Direct messages
  getDmConversations: () => request<DmConversation[]>('/dms'),
  getDmHistory: (userId: string) => request<DirectMessage[]>(`/dms/${userId}`),

  // Friends
  searchUsers: (q: string) =>
    request<PublicUser[]>(`/users/search?q=${encodeURIComponent(q)}`),
  getFriends: () => request<FriendsData>('/friends'),
  sendFriendRequest: (target: { userId?: string; username?: string }) =>
    request<{ ok: boolean; status: string }>('/friends/request', {
      method: 'POST',
      body: JSON.stringify(target),
    }),
  acceptFriend: (id: string) =>
    request<{ ok: boolean }>(`/friends/${id}/accept`, { method: 'POST' }),
  declineFriend: (id: string) =>
    request<{ ok: boolean }>(`/friends/${id}/decline`, { method: 'POST' }),
  removeFriend: (userId: string) =>
    request<{ ok: boolean }>(`/friends/${userId}`, { method: 'DELETE' }),

  // Moderation
  kickUser: (id: string) => request<{ ok: boolean }>(`/users/${id}/kick`, { method: 'POST' }),
  banUser: (id: string, reason?: string) =>
    request<PublicUser>(`/users/${id}/ban`, { method: 'POST', body: JSON.stringify({ reason }) }),
  unbanUser: (id: string) => request<PublicUser>(`/users/${id}/unban`, { method: 'POST' }),
  timeoutUser: (id: string, minutes: number) =>
    request<PublicUser>(`/users/${id}/timeout`, { method: 'POST', body: JSON.stringify({ minutes }) }),
  getBans: () => request<(PublicUser & { bannedReason?: string | null })[]>('/moderation/bans'),
};

/** Attempt to refresh the session tokens. Returns true on success. */
export async function refreshSession(): Promise<boolean> {
  return tryRefresh();
}

export { ApiError };
