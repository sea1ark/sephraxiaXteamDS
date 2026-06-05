// Transient UI state: which view, open modals, media lightbox, the member
// right-click menu, and the active reply target.
import { create } from 'zustand';

type View = 'server' | 'dm' | 'friends';
export type MediaKind = 'image' | 'video' | 'audio';

export interface MediaTarget {
  kind: MediaKind;
  url: string;
  name: string;
}

export interface MemberMenuState {
  userId: string;
  x: number;
  y: number;
}

export interface ChannelMenuState {
  channelId: string;
  x: number;
  y: number;
}

export interface ReplyTarget {
  scope: 'channel' | 'dm';
  id: string;
  content: string;
  authorName: string;
}

interface UiState {
  view: View;
  activeDmUserId: string | null; // the DM conversation currently open

  profileUserId: string | null; // user whose profile card is open
  settingsOpen: boolean;
  rolesOpen: boolean; // role-management modal

  media: MediaTarget | null; // media lightbox
  memberMenu: MemberMenuState | null; // right-click member menu
  channelMenu: ChannelMenuState | null; // right-click channel menu
  replyTo: ReplyTarget | null; // composer reply target

  showServer: () => void;
  showFriends: () => void;
  openDm: (userId: string) => void;

  openProfile: (userId: string) => void;
  closeProfile: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openRoles: () => void;
  closeRoles: () => void;

  openMedia: (media: MediaTarget) => void;
  closeMedia: () => void;
  openMemberMenu: (menu: MemberMenuState) => void;
  closeMemberMenu: () => void;
  openChannelMenu: (menu: ChannelMenuState) => void;
  closeChannelMenu: () => void;
  setReplyTo: (reply: ReplyTarget | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: 'server',
  activeDmUserId: null,

  profileUserId: null,
  settingsOpen: false,
  rolesOpen: false,

  media: null,
  memberMenu: null,
  channelMenu: null,
  replyTo: null,

  showServer: () => set({ view: 'server' }),
  showFriends: () => set({ view: 'friends', memberMenu: null }),
  openDm: (userId) =>
    set({ view: 'dm', activeDmUserId: userId, profileUserId: null, memberMenu: null, replyTo: null }),

  openProfile: (userId) => set({ profileUserId: userId, memberMenu: null }),
  closeProfile: () => set({ profileUserId: null }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openRoles: () => set({ rolesOpen: true }),
  closeRoles: () => set({ rolesOpen: false }),

  openMedia: (media) => set({ media }),
  closeMedia: () => set({ media: null }),
  openMemberMenu: (menu) => set({ memberMenu: menu, channelMenu: null }),
  closeMemberMenu: () => set({ memberMenu: null }),
  openChannelMenu: (menu) => set({ channelMenu: menu, memberMenu: null }),
  closeChannelMenu: () => set({ channelMenu: null }),
  setReplyTo: (replyTo) => set({ replyTo }),
}));
