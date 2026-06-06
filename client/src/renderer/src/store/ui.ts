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
  bansOpen: boolean; // banned-users management modal

  media: MediaTarget | null; // media lightbox
  memberMenu: MemberMenuState | null; // right-click member menu
  channelMenu: ChannelMenuState | null; // right-click channel menu
  replyTo: ReplyTarget | null; // composer reply target

  screenPickerOpen: boolean; // screen-share source picker
  screenViewUserId: string | null; // whose shared screen we're watching (fullscreen)
  voiceStageChannelId: string | null; // voice channel whose Discord-style stage fills the main column

  showServer: () => void;
  showFriends: () => void;
  openDm: (userId: string) => void;

  openProfile: (userId: string) => void;
  closeProfile: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openRoles: () => void;
  closeRoles: () => void;
  openBans: () => void;
  closeBans: () => void;

  openMedia: (media: MediaTarget) => void;
  closeMedia: () => void;
  openMemberMenu: (menu: MemberMenuState) => void;
  closeMemberMenu: () => void;
  openChannelMenu: (menu: ChannelMenuState) => void;
  closeChannelMenu: () => void;
  setReplyTo: (reply: ReplyTarget | null) => void;

  openScreenPicker: () => void;
  closeScreenPicker: () => void;
  openScreenView: (userId: string) => void;
  closeScreenView: () => void;
  showVoiceStage: (channelId: string) => void;
  clearVoiceStage: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: 'server',
  activeDmUserId: null,

  profileUserId: null,
  settingsOpen: false,
  rolesOpen: false,
  bansOpen: false,

  media: null,
  memberMenu: null,
  channelMenu: null,
  replyTo: null,

  screenPickerOpen: false,
  screenViewUserId: null,
  voiceStageChannelId: null,

  showServer: () => set({ view: 'server' }),
  showFriends: () => set({ view: 'friends', memberMenu: null, voiceStageChannelId: null }),
  openDm: (userId) =>
    set({ view: 'dm', activeDmUserId: userId, profileUserId: null, memberMenu: null, replyTo: null, voiceStageChannelId: null }),

  openProfile: (userId) => set({ profileUserId: userId, memberMenu: null }),
  closeProfile: () => set({ profileUserId: null }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openRoles: () => set({ rolesOpen: true }),
  closeRoles: () => set({ rolesOpen: false }),
  openBans: () => set({ bansOpen: true }),
  closeBans: () => set({ bansOpen: false }),

  openMedia: (media) => set({ media }),
  closeMedia: () => set({ media: null }),
  openMemberMenu: (menu) => set({ memberMenu: menu, channelMenu: null }),
  closeMemberMenu: () => set({ memberMenu: null }),
  openChannelMenu: (menu) => set({ channelMenu: menu, memberMenu: null }),
  closeChannelMenu: () => set({ channelMenu: null }),
  setReplyTo: (replyTo) => set({ replyTo }),

  openScreenPicker: () => set({ screenPickerOpen: true }),
  closeScreenPicker: () => set({ screenPickerOpen: false }),
  openScreenView: (userId) => set({ screenViewUserId: userId }),
  closeScreenView: () => set({ screenViewUserId: null }),
  showVoiceStage: (channelId) => set({ voiceStageChannelId: channelId }),
  clearVoiceStage: () => set({ voiceStageChannelId: null }),
}));
