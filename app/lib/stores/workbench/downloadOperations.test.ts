import { describe, expect, it, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import type { FileMap } from '~/lib/stores/files';
import { WORK_DIR } from '~/utils/constants';

// Capture the blob passed to saveAs so we can inspect the zip contents
let capturedBlob: Blob | undefined;

vi.mock('file-saver', () => ({
  default: {
    saveAs: vi.fn((blob: Blob) => {
      capturedBlob = blob;
    }),
  },
}));

vi.mock('~/lib/persistence', () => ({
  description: { value: 'Test Project' },
}));

// Import after mocks are set up
import { downloadZip } from '~/lib/stores/workbench/downloadOperations';

/**
 * Helper: convert Blob to ArrayBuffer for JSZip.loadAsync in Node/Vitest.
 * JSZip.loadAsync cannot read Node Blob objects directly.
 */
async function blobToZip(blob: Blob): Promise<JSZip> {
  const buffer = await blob.arrayBuffer();
  return JSZip.loadAsync(buffer);
}

describe('downloadOperations', () => {
  beforeEach(() => {
    capturedBlob = undefined;
    vi.clearAllMocks();
  });

  describe('downloadZip', () => {
    it('should create a zip containing all non-binary files', async () => {
      const files: FileMap = {
        [`${WORK_DIR}/index.ts`]: { type: 'file', content: 'console.log("hello");', isBinary: false },
        [`${WORK_DIR}/readme.md`]: { type: 'file', content: '# Hello', isBinary: false },
      };

      await downloadZip(() => files);

      expect(capturedBlob).toBeDefined();

      const zip = await blobToZip(capturedBlob!);
      const indexContent = await zip.file('index.ts')?.async('string');
      const readmeContent = await zip.file('readme.md')?.async('string');

      expect(indexContent).toBe('console.log("hello");');
      expect(readmeContent).toBe('# Hello');
    });

    it('should skip binary files', async () => {
      const files: FileMap = {
        [`${WORK_DIR}/app.ts`]: { type: 'file', content: 'code', isBinary: false },
        [`${WORK_DIR}/image.png`]: { type: 'file', content: '', isBinary: true },
      };

      await downloadZip(() => files);

      const zip = await blobToZip(capturedBlob!);

      expect(zip.file('app.ts')).not.toBeNull();
      expect(zip.file('image.png')).toBeNull();
    });

    it('should skip folder entries', async () => {
      const files: FileMap = {
        [`${WORK_DIR}/src`]: { type: 'folder' },
        [`${WORK_DIR}/src/index.ts`]: { type: 'file', content: 'code', isBinary: false },
      };

      await downloadZip(() => files);

      const zip = await blobToZip(capturedBlob!);
      const indexContent = await zip.file('src/index.ts')?.async('string');

      expect(indexContent).toBe('code');
    });

    it('should handle nested directory structures', async () => {
      const files: FileMap = {
        [`${WORK_DIR}/src/components/Button.tsx`]: {
          type: 'file',
          content: '<button />',
          isBinary: false,
        },
      };

      await downloadZip(() => files);

      const zip = await blobToZip(capturedBlob!);
      const buttonContent = await zip.file('src/components/Button.tsx')?.async('string');

      expect(buttonContent).toBe('<button />');
    });

    it('should produce a valid zip even when there are no files', async () => {
      const files: FileMap = {};

      await downloadZip(() => files);

      expect(capturedBlob).toBeDefined();

      const zip = await blobToZip(capturedBlob!);

      expect(Object.keys(zip.files)).toHaveLength(0);
    });

    it('should handle undefined entries in the file map', async () => {
      const files: FileMap = {
        [`${WORK_DIR}/exists.ts`]: { type: 'file', content: 'yes', isBinary: false },
        [`${WORK_DIR}/gone.ts`]: undefined,
      };

      await downloadZip(() => files);

      const zip = await blobToZip(capturedBlob!);

      expect(zip.file('exists.ts')).not.toBeNull();
      expect(zip.file('gone.ts')).toBeNull();
    });
  });
});
