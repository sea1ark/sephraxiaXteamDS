// Second column in DM view: list of conversations.
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { Avatar } from './Avatar';
import { UserFooter } from './UserFooter';
import { nameColor } from '../lib/roles';

export function DmList() {
  const conversations = useChatStore((s) => s.dmConversations);
  const unread = useChatStore((s) => s.dmUnread);
  const activeDmUserId = useUiStore((s) => s.activeDmUserId);
  const openDm = useUiStore((s) => s.openDm);

  return (
    <div className="glass flex w-60 flex-col rounded-glass">
      <div className="border-b border-glass-border px-4 py-3">
        <span className="heading-glow text-sm font-semibold tracking-[0.15em]">direct messages</span>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pt-2">
        {conversations.map((c) => {
          const isUnread = !!unread[c.user.id] && c.user.id !== activeDmUserId;
          return (
            <div
              key={c.user.id}
              onClick={() => openDm(c.user.id)}
              className={`channel-item !py-2 ${c.user.id === activeDmUserId ? 'active' : ''}`}
            >
              <Avatar username={c.user.username} avatarUrl={c.user.avatarUrl} size={28} />
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-sm ${isUnread ? 'font-semibold text-text-heading' : ''}`}
                  style={{ color: nameColor(c.user) }}
                >
                  {c.user.username}
                </div>
                {c.lastMessage && (
                  <div
                    className={`truncate text-[11px] ${isUnread ? 'text-text-primary' : 'text-text-muted'}`}
                  >
                    {c.lastMessage.content}
                  </div>
                )}
              </div>
              {isUnread && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-accent-pink shadow-glow-violet" />
              )}
            </div>
          );
        })}
        {conversations.length === 0 && (
          <p className="px-3 py-2 text-xs text-text-muted">
            no conversations yet. open someone's profile and hit "send message".
          </p>
        )}
      </div>

      <UserFooter />
    </div>
  );
}
