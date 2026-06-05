import { Titlebar } from './components/Titlebar';
import { Background } from './components/Background';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { ProfileModal } from './components/ProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { RolesModal } from './components/RolesModal';
import { MediaViewer } from './components/MediaViewer';
import { MemberContextMenu } from './components/MemberContextMenu';
import { ChannelContextMenu } from './components/ChannelContextMenu';
import { useAuthStore } from './store/auth';

export default function App() {
  const loggedIn = useAuthStore((s) => !!s.accessToken && !!s.user);

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
      <ProfileModal />
      <SettingsModal />
      <RolesModal />
      <MediaViewer />
      <MemberContextMenu />
      <ChannelContextMenu />
    </div>
  );
}
