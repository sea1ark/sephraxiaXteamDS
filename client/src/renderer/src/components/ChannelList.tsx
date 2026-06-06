import { useState } from 'react';
import type { ChannelType } from '@sephraxia/shared';
import { api } from '../lib/api';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { useVoiceStore } from '../store/voice';
import * as voice from '../lib/voice';
import { UserFooter } from './UserFooter';
import { VoicePanel } from './VoicePanel';
import { Avatar } from './Avatar';
import { nameColor, displayName } from '../lib/roles';
import { SpeakerIcon, VideoIcon, ScreenShareIcon, MicOffIcon, BanIcon } from './icons';

export function ChannelList() {
  const channels = useChatStore((s) => s.channels);
  const activeId = useChatStore((s) => s.activeChannelId);
  const setActive = useChatStore((s) => s.setActiveChannel);
  const setChannels = useChatStore((s) => s.setChannels);
  const users = useChatStore((s) => s.users);
  const permissions = useAuthStore((s) => s.permissions);
  const openRoles = useUiStore((s) => s.openRoles);
  const openMemberMenu = useUiStore((s) => s.openMemberMenu);
  const openChannelMenu = useUiStore((s) => s.openChannelMenu);
  const showVoiceStage = useUiStore((s) => s.showVoiceStage);
  const clearVoiceStage = useUiStore((s) => s.clearVoiceStage);
  const stageChannelId = useUiStore((s) => s.voiceStageChannelId);
  const voiceChannelId = useVoiceStore((s) => s.channelId);
  const voiceParticipants = useVoiceStore((s) => s.participants);
  const speaking = useVoiceStore((s) => s.speaking);
  const remoteMedia = useVoiceStore((s) => s.remoteMedia);
  const sharingScreen = useVoiceStore((s) => s.sharingScreen);
  const cameraOn = useVoiceStore((s) => s.cameraOn);
  const myId = useAuthStore((s) => s.user?.id);
  const openScreenView = useUiStore((s) => s.openScreenView);

  const canManageChannels = !!permissions?.canManageChannels;
  const canManageRoles = !!permissions?.canManageRoles;
  const canBan = !!permissions?.canBan;
  const openBans = useUiStore((s) => s.openBans);

  const [creating, setCreating] = useState<ChannelType | null>(null);
  const [name, setName] = useState('');

  const textChannels = channels.filter((c) => c.type !== 'voice');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !creating) return;
    await api.createChannel(trimmed, creating);
    setChannels(await api.getChannels());
    setName('');
    setCreating(null);
  }

  const Header = ({ label, type }: { label: string; type: ChannelType }) => (
    <div className="flex items-center justify-between px-3 pb-1 pt-4">
      <span className="section-label">{label}</span>
      {canManageChannels && (
        <button
          onClick={() => {
            setCreating((c) => (c === type ? null : type));
            setName('');
          }}
          className="text-text-muted transition hover:text-accent-violet"
          title={`create ${type} channel`}
        >
          +
        </button>
      )}
    </div>
  );

  const CreateForm = ({ type }: { type: ChannelType }) =>
    creating === type ? (
      <form onSubmit={createChannel} className="px-3 pb-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => !name && setCreating(null)}
          placeholder={type === 'voice' ? 'voice-channel' : 'channel-name'}
          className="glass-input text-sm"
        />
      </form>
    ) : null;

  return (
    <div className="sx-fade glass flex w-60 flex-col rounded-glass">
      <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
        <span className="heading-glow text-sm font-semibold tracking-[0.15em]">home</span>
        <div className="flex items-center gap-2">
          {canBan && (
            <button
              onClick={openBans}
              className="text-text-muted transition hover:text-accent-pink"
              title="banned users"
            >
              <BanIcon size={16} />
            </button>
          )}
          {canManageRoles && (
            <button
              onClick={openRoles}
              className="text-text-muted transition hover:text-accent-violet"
              title="manage roles"
            >
              ◈
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {/* text channels */}
        <Header label="text channels" type="text" />
        <CreateForm type="text" />
        <div className="space-y-0.5">
          {textChannels.map((c) => (
            <div
              key={c.id}
              onClick={() => {
                setActive(c.id);
                clearVoiceStage();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                openChannelMenu({ channelId: c.id, x: e.clientX, y: e.clientY });
              }}
              className={`channel-item ${c.id === activeId && !stageChannelId ? 'active' : ''}`}
            >
              <span className="text-text-muted">#</span>
              <span className="truncate text-sm">{c.name}</span>
            </div>
          ))}
          {textChannels.length === 0 && (
            <p className="px-3 py-1 text-xs text-text-muted">no text channels yet</p>
          )}
        </div>

        {/* voice channels */}
        <Header label="voice channels" type="voice" />
        <CreateForm type="voice" />
        <div className="space-y-0.5">
          {voiceChannels.map((c) => {
            const here = voiceParticipants[c.id] ?? [];
            const connected = voiceChannelId === c.id;
            return (
              <div key={c.id}>
                <div
                  onClick={() => {
                    voice.joinVoice(c.id);
                    showVoiceStage(c.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openChannelMenu({ channelId: c.id, x: e.clientX, y: e.clientY });
                  }}
                  className={`channel-item ${connected || stageChannelId === c.id ? 'active' : ''}`}
                  title="open voice"
                >
                  <span className="text-text-muted"><SpeakerIcon size={16} /></span>
                  <span className="truncate text-sm">{c.name}</span>
                  {here.length > 0 && (
                    <span className="ml-auto text-[10px] text-text-muted">{here.length}</span>
                  )}
                </div>
                {here.length > 0 && (
                  <div className="ml-3 space-y-0.5 border-l border-glass-border py-0.5 pl-3">
                    {here.map((p) => {
                      const u = users.find((x) => x.id === p.userId);
                      const isMe = p.userId === myId;
                      const sharing = isMe ? sharingScreen : !!remoteMedia[p.userId]?.screenStreamId;
                      const onCam = isMe ? cameraOn : !!remoteMedia[p.userId]?.camStreamId;
                      return (
                        <div
                          key={p.userId}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            openMemberMenu({ userId: p.userId, x: e.clientX, y: e.clientY });
                          }}
                          className="flex items-center gap-2 py-0.5 text-xs"
                        >
                          <span
                            className="grid shrink-0 place-items-center rounded-full transition-shadow"
                            style={{
                              boxShadow: speaking[p.userId] ? '0 0 0 2px #6cd47e, 0 0 8px #6cd47e' : 'none',
                              borderRadius: '9999px',
                            }}
                          >
                            <Avatar
                              username={displayName(u)}
                              avatarUrl={u?.avatarUrl}
                              size={20}
                              color={nameColor(u)}
                            />
                          </span>
                          <span className="truncate" style={{ color: nameColor(u) }}>
                            {displayName(u)}
                          </span>
                          <span className="ml-auto flex items-center gap-1.5 text-text-muted">
                            {onCam && (
                              <span title="camera on">
                                <VideoIcon size={14} />
                              </span>
                            )}
                            {sharing && (
                              <button
                                onClick={() => openScreenView(p.userId)}
                                className="transition hover:scale-110 hover:text-accent-violet"
                                title="watch screen"
                              >
                                <ScreenShareIcon size={14} />
                              </button>
                            )}
                            {p.muted && (
                              <span className="text-[#f23f43]" title="muted">
                                <MicOffIcon size={14} />
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {voiceChannels.length === 0 && (
            <p className="px-3 py-1 text-xs text-text-muted">no voice channels yet</p>
          )}
        </div>
      </div>

      <VoicePanel />
      <UserFooter />
    </div>
  );
}
