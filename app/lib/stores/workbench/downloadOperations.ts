import JSZip from 'jszip';
import fileSaver from 'file-saver';
import type { FileMap } from '~/lib/stores/files';
import { description } from '~/lib/persistence';
import { extractRelativePath } from '~/utils/diff';

const { saveAs } = fileSaver;

/**
 * Download all project files as a ZIP archive.
 *
 * The archive name is derived from the current project description and a
 * timestamp-based hash to avoid collisions.
 */
export async function downloadZip(getFiles: () => FileMap): Promise<void> {
  const zip = new JSZip();
  const files = getFiles();

  // Get the project name from the description input, or use a default name
  const projectName = (description.value ?? 'project').toLocaleLowerCase().split(' ').join('_');

  // Generate a simple 6-character hash based on the current timestamp
  const timestampHash = Date.now().toString(36).slice(-6);
  const uniqueProjectName = `${projectName}_${timestampHash}`;

  for (const [filePath, dirent] of Object.entries(files)) {
    if (dirent?.type === 'file' && !dirent.isBinary) {
      const relativePath = extractRelativePath(filePath);

      // split the path into segments
      const pathSegments = relativePath.split('/');

      // if there's more than one segment, we need to create folders
      if (pathSegments.length > 1) {
        let currentFolder = zip;

        for (let i = 0; i < pathSegments.length - 1; i++) {
          currentFolder = currentFolder.folder(pathSegments[i])!;
        }
        currentFolder.file(pathSegments[pathSegments.length - 1], dirent.content);
      } else {
        // if there's only one segment, it's a file in the root
        zip.file(relativePath, dirent.content);
      }
    }
  }

  // Generate the zip file and save it
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${uniqueProjectName}.zip`);
}

/**
 * Synchronise project files to a local directory via the File System Access API.
 *
 * Returns the list of relative paths that were written.
 */
export async function syncFiles(getFiles: () => FileMap, targetHandle: FileSystemDirectoryHandle): Promise<string[]> {
  const files = getFiles();
  const syncedFiles: string[] = [];

  for (const [filePath, dirent] of Object.entries(files)) {
    if (dirent?.type === 'file' && !dirent.isBinary) {
      const relativePath = extractRelativePath(filePath);
      const pathSegments = relativePath.split('/');
      let currentHandle = targetHandle;

      for (let i = 0; i < pathSegments.length - 1; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i], { create: true });
      }

      // create or get the file
      const fileHandle = await currentHandle.getFileHandle(pathSegments[pathSegments.length - 1], {
        create: true,
      });

      // write the file content
      const writable = await fileHandle.createWritable();
      await writable.write(dirent.content);
      await writable.close();

      syncedFiles.push(relativePath);
    }
  }

  return syncedFiles;
}
