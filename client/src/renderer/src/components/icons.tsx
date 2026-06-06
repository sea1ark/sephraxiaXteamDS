// Small set of crisp line icons (24x24, currentColor) for the voice / call UI —
// replaces the emoji glyphs. Stroke-based, Lucide-ish style.
import type { SVGProps } from 'react';

type IconProps = { size?: number } & SVGProps<SVGSVGElement>;

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="21" />
    <line x1="8" y1="21" x2="16" y2="21" />
  </Svg>
);

export const MicOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5a3 3 0 0 1 6 0v5m-.6 2.4A3 3 0 0 1 9 11v-1" />
    <path d="M5 11a7 7 0 0 0 10.5 6.06M19 11a6.9 6.9 0 0 1-.4 2.3" />
    <line x1="12" y1="18" x2="12" y2="21" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </Svg>
);

export const HeadsetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="3" y="13" width="4" height="7" rx="1.6" />
    <rect x="17" y="13" width="4" height="7" rx="1.6" />
  </Svg>
);

export const HeadsetOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 14v-2a8 8 0 0 1 13.2-6.1M20 11v3" />
    <rect x="3" y="13" width="4" height="7" rx="1.6" />
    <rect x="17" y="13" width="4" height="7" rx="1.6" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </Svg>
);

export const VideoIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="6" width="13" height="12" rx="2" />
    <path d="M15 10.5l6-3.5v10l-6-3.5z" />
  </Svg>
);

export const VideoOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 10.5l6-3.5v10l-6-3.5z" />
    <path d="M11 6h2a2 2 0 0 1 2 2v0M2 8a2 2 0 0 1 2-2M2 8v8a2 2 0 0 0 2 2h9a2 2 0 0 0 1.9-1.4" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </Svg>
);

export const ScreenShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <path d="M12 13V8M9.5 10.5 12 8l2.5 2.5" />
  </Svg>
);

const phonePath =
  'M6.6 3.5c.5 0 .9.3 1 .8l.8 3a1 1 0 0 1-.27 1L6.7 9.6a12 12 0 0 0 5.7 5.7l1.3-1.4a1 1 0 0 1 1-.27l3 .8c.5.1.8.5.8 1V19a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2z';

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d={phonePath} />
  </Svg>
);

export const HangupIcon = (p: IconProps) => (
  <Svg {...p}>
    <g transform="rotate(135 12 12)">
      <path d={phonePath} />
    </g>
  </Svg>
);

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 13l4 4L19 7" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const SignalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 18v-2M10 18v-5M15 18v-8M20 18V6" />
  </Svg>
);

export const SpeakerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </Svg>
);

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
    <circle cx="9" cy="8" r="3.4" />
    <path d="M22 19v-1a4 4 0 0 0-3-3.85M16 4.15a4 4 0 0 1 0 7.7" />
  </Svg>
);

export const StopIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4z" />
  </Svg>
);

