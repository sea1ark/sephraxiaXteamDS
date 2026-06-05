// Shared composer attachment logic: upload files (picker / drag-drop / paste),
// track per-file progress, and expose the uploaded Attachment list for sending.
import { useState } from 'react';
import type { Attachment } from '@sephraxia/shared';
import { api } from './api';
import type { PendingAttachment } from '../components/AttachmentTray';

export function useAttachments() {
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setPending((prev) => {
      const slots = Math.max(0, 10 - prev.length);
      const accepted = files.slice(0, slots);
      const next = [...prev];
      for (const file of accepted) {
        const localId = `${file.name}-${file.size}-${file.lastModified}-${Math.round(
          performance.now(),
        )}-${Math.random()}`;
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        next.push({ localId, name: file.name, type: file.type, status: 'uploading', preview });
        api
          .uploadFile(file)
          .then((attachment) =>
            setPending((p) =>
              p.map((x) => (x.localId === localId ? { ...x, status: 'done', attachment } : x)),
            ),
          )
          .catch((err) =>
            setPending((p) =>
              p.map((x) =>
                x.localId === localId
                  ? { ...x, status: 'error', error: err?.message ?? 'upload failed' }
                  : x,
              ),
            ),
          );
      }
      return next;
    });
  }

  function removePending(localId: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.localId !== localId);
    });
  }

  function clearPending() {
    setPending((prev) => {
      prev.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      return [];
    });
  }

  const uploading = pending.some((p) => p.status === 'uploading');
  const ready: Attachment[] = pending
    .filter((p) => p.status === 'done' && p.attachment)
    .map((p) => p.attachment!);

  return { pending, uploadFiles, removePending, clearPending, uploading, ready };
}
