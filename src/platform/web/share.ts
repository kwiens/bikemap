import { downloadFile } from '@/utils/format';
import type { ExportFile, ShareService } from '../types';

/**
 * The browser: a generated file is a download, and sharing a link means
 * putting it on the clipboard. Inside a WebView neither works — a blob
 * download goes nowhere and the clipboard may be unavailable — which is why
 * the shell provides this service natively.
 */
export function createWebShare(): ShareService {
  return {
    isSupported: () => typeof document !== 'undefined',

    async exportFile({ filename, mimeType, content }: ExportFile) {
      if (typeof document === 'undefined') return 'failed';
      try {
        downloadFile(content, filename, mimeType);
        return 'downloaded';
      } catch {
        return 'failed';
      }
    },

    async shareLink(url: string) {
      try {
        await navigator.clipboard.writeText(url);
        return 'copied';
      } catch {
        return 'failed';
      }
    },
  };
}
