// Circular avatar: image if present, otherwise the first letter on a tinted
// fill with a coloured border.
import { resolveAssetUrl } from '../lib/config';

interface Props {
  username: string;
  avatarUrl?: string | null;
  size?: number;
  color?: string;
}

export function Avatar({ username, avatarUrl, size = 36, color = '#7d6fc4' }: Props) {
  const style = {
    width: size,
    height: size,
    borderColor: color,
    background: `${color}22`,
    boxShadow: `0 0 10px ${color}55`,
  };
  const src = resolveAssetUrl(avatarUrl);
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border"
      style={style}
    >
      {src ? (
        <img src={src} alt={username} className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-semibold text-text-heading">
          {username.slice(0, 1).toLowerCase()}
        </span>
      )}
    </div>
  );
}
