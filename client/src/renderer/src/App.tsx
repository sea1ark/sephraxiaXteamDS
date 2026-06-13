import { useEffect } from 'react';
import { Titlebar } from './components/Titlebar';
import { Background } from './components/Background';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { QuickSwitcher } from './components/QuickSwitcher';
import { useUiStore } from './store/ui';
import { ProfileModal } from './components/ProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { RolesModal } from './components/RolesModal';
import { BansModal } from './components/BansModal';
import { MediaViewer } from './components/MediaViewer';
import { MemberContextMenu } from './components/MemberContextMenu';
import { ChannelContextMenu } from './components/ChannelContextMenu';
import { UpdateBanner } from './components/UpdateBanner';
import { CallView } from './components/CallView';
import { IncomingCallModal } from './components/IncomingCallModal';
import { ScreenSharePicker } from './components/ScreenSharePicker';
import { ScreenViewer } from './components/ScreenViewer';
import { useAuthStore } from './store/auth';
import { useVoiceStore } from './store/voice';
import { setPttHeld } from './lib/voice';

export default function App() {
  const loggedIn = useAuthStore((s) => !!s.accessToken && !!s.user);

  // Global shortcuts: Ctrl/Cmd+K — quick switcher, Ctrl/Cmd+F — message search.
  useEffect(() => {
    if (!loggedIn) return;
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const ui = useUiStore.getState();
        ui.setQuickSwitcher(!ui.quickSwitcherOpen);
      }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const ui = useUiStore.getState();
        if (ui.view !== 'server') ui.showServer();
        ui.toggleChatPanel('search');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loggedIn]);

  // Push-to-talk: hold the configured key to open the mic. Works globally
  // (even while another window has focus would need OS hooks; this covers
  // in-app focus). Ignores key-repeat and typing fields.
  useEffect(() => {
    if (!loggedIn) return;
    function down(e: KeyboardEvent) {
      const vs = useVoiceStore.getState();
      if (!vs.pttEnabled || !vs.pttKey || e.code !== vs.pttKey || e.repeat) return;
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      setPttHeld(true);
    }
    function up(e: KeyboardEvent) {
      const vs = useVoiceStore.getState();
      if (!vs.pttEnabled || !vs.pttKey || e.code !== vs.pttKey) return;
      setPttHeld(false);
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [loggedIn]);

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden"
      style={{
        background:
          'radial-gradient(120% 100% at 50% 0%, #0c0a16 0%, #070611 45%, #050409 100%)',
      }}
    >
      <Background />
      <div className="relative z-10">
        <Titlebar />
      </div>
      {loggedIn ? <Layout /> : <Login />}
      {loggedIn && (
        <>
          <CallView />
          <IncomingCallModal />
          <ScreenSharePicker />
          <ScreenViewer />
        </>
      )}
      <ProfileModal />
      <SettingsModal />
      <RolesModal />
      <BansModal />
      <MediaViewer />
      <MemberContextMenu />
      <ChannelContextMenu />
      <UpdateBanner />
      {loggedIn && <QuickSwitcher />}
      <Toasts />
    </div>
  );
}
