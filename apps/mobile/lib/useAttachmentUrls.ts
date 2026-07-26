// Resolves chat attachment storage paths to signed URLs for display.
//
// The chat-attachments bucket is private (migration 0021), so an attachment can't be rendered
// from its path alone — each needs a short-lived signed URL. Paths are requested once and
// cached for the life of the screen; a failed batch is un-marked so it can be retried on the
// next render rather than leaving the attachment permanently blank.
import { useEffect, useRef, useState } from 'react';
import { api } from '@noot/core';

export function useAttachmentUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const requested = useRef<Set<string>>(new Set());
  const key = paths.join('|');

  useEffect(() => {
    const missing = paths.filter((p) => p && !requested.current.has(p));
    if (!missing.length) return;
    missing.forEach((p) => requested.current.add(p));

    let active = true;
    api.chat
      .attachmentUrls(missing)
      .then((map) => {
        if (active) setUrls((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {
        missing.forEach((p) => requested.current.delete(p));
      });
    return () => {
      active = false;
    };
    // `key` is the stable stand-in for the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
