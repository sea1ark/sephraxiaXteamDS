import { useEffect } from 'react';
import { api, refreshSession } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import * as voice from '../lib/voice';
import { sounds } from '../lib/sounds';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { useVoiceStore } from '../store/voice';
import { toast } from '../store/toasts';
import { displayName } from '../lib/roles';
import { ServerList } from './ServerList';
import { ChannelList } from './ChannelList';
import { DmList } from './DmList';
import { Chat } from './Chat';
import { DmChat } from './DmChat';
import { FriendsView } from './FriendsView';
import { UserList } from './UserList';
import { VoiceStage } from './VoiceStage';

export function Layout() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const patchUser = useAuthStore((s) => s.patchUser);
  const myId = useAuthStore((s) => s.user?.id);

  const view = useUiStore((s) => s.view);
  const stageChannelId = useUiStore((s) => s.voiceStageChannelId);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeDmUserId = useUiStore((s) => s.activeDmUserId);

  const {
    setServers,
    setChannels,
    setUsers,
    setUserStatus,
    upsertUser,
    setRoles,
    addMessage,
    updateMessage,
    removeMessage,
    setMessages,
    setTyping,
    setDmConversations,
    addDm,
    updateDm,
    removeDm,
    setFriends,
  } = useChatStore.getState();

  // Connect socket + load initial data once we have a token.
  useEffect(() => {
    if (!accessToken) return;
    const socket = connectSocket(accessToken);

    socket.on('connect_error', async (err) => {
      if (err.message === 'banned') {
        alert('this account has been banned.');
        logout();
        return;
      }
      if (err.message !== 'unauthorized') return;
      // The access token is likely just expired. Refresh it — on success the
      // store update re-runs this effect and reconnects with the fresh token;
      // only a failed refresh (invalid/expired refresh token) logs us out.
      const ok = await refreshSession();
      if (!ok) logout();
    });
    // Reconnect feedback: quiet toast when the link drops / comes back.
    let everConnected = false;
    socket.on('connect', () => {
      if (everConnected) toast('соединение восстановлено', 'success');
      everConnected = true;
    });
    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') toast('соединение потеряно — переподключаюсь…', 'error');
    });

    socket.on('message:new', (msg) => addMessage(msg));
    socket.on('message:update', (msg) => updateMessage(msg));
    socket.on('message:delete', ({ messageId, channelId }) => removeMessage(channelId, messageId));
    socket.on('dm:new', (dm) => {
      addDm(dm, myId);
      // Toast incoming DMs unless that conversation is already on screen.
      if (dm.fromId !== myId) {
        const ui = useUiStore.getState();
        const viewing = ui.view === 'dm' && ui.activeDmUserId === dm.fromId;
        if (!viewing) {
          const sender = dm.from ? displayName(dm.from) : 'новое сообщение';
          toast(sender, 'message', dm.content || '(вложение)', () =>
            useUiStore.getState().openDm(dm.fromId),
          );
        }
      }
    });
    socket.on('dm:update', (dm) => updateDm(dm, myId));
    socket.on('dm:delete', (payload) => removeDm(payload, myId));
    socket.on('user:online', ({ userId, status }) => setUserStatus(userId, status));
    socket.on('user:offline', ({ userId }) => setUserStatus(userId, 'offline'));
    socket.on('user:update', (user) => {
      upsertUser(user);
      if (user.id === myId) {
        patchUser(user);
        api.getPermissions().then(setPermissions).catch(() => {});
      }
    });
    socket.on('roles:changed', () => {
      api.getRoles().then(setRoles).catch(() => {});
      api.getUsers().then(setUsers).catch(() => {});
      api.getPermissions().then(setPermissions).catch(() => {});
    });
    socket.on('channels:changed', () => {
      api.getChannels().then(setChannels).catch(() => {});
    });
    socket.on('servers:changed', () => {
      // Memberships affect both the rail and which channels we can see.
      api.getServers().then(setServers).catch(() => {});
      api.getChannels().then(setChannels).catch(() => {});
    });
    socket.on('friends:changed', () => {
      api.getFriends().then(setFriends).catch(() => {});
    });
    socket.on('typing:start', ({ channelId, userId }) => setTyping(channelId, userId, true));
    socket.on('typing:stop', ({ channelId, userId }) => setTyping(channelId, userId, false));

    // --- Voice ---
    const vstore = useVoiceStore.getState();
    socket.on('voice:snapshot', ({ channels }) => vstore.setSnapshot(channels));
    socket.on('voice:joined', ({ channelId, userId }) => {
      vstore.addParticipant(channelId, userId);
      // Someone else joined the channel I'm in → play the join chime.
      if (userId !== myId && useVoiceStore.getState().channelId === channelId) sounds.join();
    });
    socket.on('voice:left', ({ channelId, userId }) => {
      const wasMine = useVoiceStore.getState().channelId === channelId;
      vstore.removeParticipant(channelId, userId);
      voice.onPeerLeft(userId);
      if (userId !== myId && wasMine) sounds.leave();
    });
    socket.on('voice:state', ({ channelId, userId, muted }) =>
      vstore.setParticipantMuted(channelId, userId, muted),
    );
    socket.on('voice:peers', ({ participants }) => voice.onPeers(participants));
    socket.on('voice:signal', ({ fromUserId, data }) => voice.onSignal(fromUserId, data));

    // --- 1:1 calls ---
    socket.on('call:incoming', ({ fromUserId }) => {
      const vs = useVoiceStore.getState();
      // Busy? auto-decline so the caller isn't left ringing.
      if (vs.call.status !== 'idle' || vs.channelId) {
        socket.emit('call:decline', { peerUserId: fromUserId });
        return;
      }
      vs.setIncoming(fromUserId);
      api.getUser(fromUserId).then(upsertUser).catch(() => {});
    });
    socket.on('call:accepted', ({ peerUserId }) => {
      sounds.ringtone.stop();
      voice.onCallAccepted(peerUserId);
    });
    socket.on('call:declined', () => {
      voice.abortOutgoing();
      useVoiceStore.getState().endCallState();
      sounds.leave();
    });
    socket.on('call:canceled', () => {
      sounds.ringtone.stop();
      useVoiceStore.getState().endCallState();
    });
    socket.on('call:ended', () => voice.handleRemoteCallEnd());
    socket.on('call:busy', () => {
      voice.abortOutgoing();
      useVoiceStore.getState().endCallState();
      alert('that user is already in a call.');
    });
    socket.on('call:unavailable', () => {
      voice.abortOutgoing();
      useVoiceStore.getState().endCallState();
      alert('that user is offline.');
    });

    socket.on('moderation:enforced', ({ action, reason }) => {
      alert(action === 'ban' ? `you were banned${reason ? `: ${reason}` : ''}.` : 'you were kicked.');
      logout();
    });

    (async () => {
      try {
        const [servers, channels, users, roles, perms, dms, friends] = await Promise.all([
          api.getServers(),
          api.getChannels(),
          api.getUsers(),
          api.getRoles(),
          api.getPermissions(),
          api.getDmConversations(),
          api.getFriends(),
        ]);
        setServers(servers);
        setChannels(channels);
        setUsers(users);
        setRoles(roles);
        setPermissions(perms);
        setDmConversations(dms);
        setFriends(friends);
      } catch {
        /* token may be invalid; the api layer will have logged us out */
      }
    })();

    return () => {
      voice.cleanupVoice();
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Load channel message history when the active channel changes. Skipped when
  // a jump-to-message is pending — Chat loads an "around" window instead, and a
  // racing latest-history fetch would overwrite it.
  useEffect(() => {
    if (!activeChannelId) return;
    if (useUiStore.getState().pendingJump?.channelId === activeChannelId) return;
    api
      .getMessages(activeChannelId)
      .then((messages) => setMessages(activeChannelId, messages))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId]);

  // Load DM history when the active DM conversation changes.
  useEffect(() => {
    if (!activeDmUserId) return;
    api
      .getDmHistory(activeDmUserId)
      .then((messages) => useChatStore.getState().setDmMessages(activeDmUserId, messages))
      .catch(() => {});
    // also make sure we have the partner's profile cached
    api.getUser(activeDmUserId).then(upsertUser).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDmUserId]);

  return (
    <div className="relative z-10 flex min-h-0 flex-1 gap-2 p-2 pt-0">
      <ServerList />
      {view === 'server' && (
        <>
          <ChannelList />
          {stageChannelId ? (
            <VoiceStage channelId={stageChannelId} />
          ) : (
            <>
              <Chat />
              <UserList />
            </>
          )}
        </>
      )}
      {view === 'dm' && (
        <>
          <DmList />
          <DmChat />
        </>
      )}
      {view === 'friends' && (
        <>
          <DmList />
          <FriendsView />
        </>
      )}
    </div>
  );
}
