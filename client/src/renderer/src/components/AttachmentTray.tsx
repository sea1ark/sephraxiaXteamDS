// Row of pending attachments shown above the composer while they upload.
import type { Attachment } from '@sephraxia/shared';

export interface PendingAttachment {
  localId: string;
  name: string;
  type: string;
  status: 'uploading' | 'done' | 'error';
  preview?: string; // object URL for local image preview
  attachment?: Attachment; // populated once uploaded
  error?: string;
}

export function AttachmentTray({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (localId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isImage = item.type.startsWith('image/');
        return (
          <div
            key={item.localId}
            className="relative flex items-center gap-2 rounded-glass p-1.5 pr-7"
            style={{
              background: 'rgba(10,8,16,0.6)',
              border: `1px solid ${item.status === 'error' ? 'rgba(212,83,126,0.6)' : 'rgba(180,160,240,0.18)'}`,
            }}
            title={item.error ?? item.name}
          >
            {isImage && item.preview ? (
              <img
                src={item.preview}
                alt={item.name}
                className="h-11 w-11 rounded object-cover"
                style={{ opacity: item.status === 'uploading' ? 0.5 : 1 }}
              />
            ) : (
              <div className="grid h-11 w-11 place-items-center rounded bg-[rgba(125,111,196,0.15)] text-lg">
                📄
              </div>
            )}
            <div className="max-w-[120px]">
              <div className="truncate text-xs text-text-primary">{item.name}</div>
              <div
                className={`text-[10px] ${
                  item.status === 'error' ? 'text-accent-pink' : 'text-text-muted'
                }`}
              >
                {item.status === 'uploading'
                  ? 'uploading…'
                  : item.status === 'error'
                    ? item.error ?? 'failed'
                    : 'ready'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.localId)}
              className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full text-[11px] text-text-muted hover:text-accent-pink"
              style={{ background: 'rgba(0,0,0,0.4)' }}
              title="remove"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
