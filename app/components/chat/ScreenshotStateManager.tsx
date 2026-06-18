import type { ReactNode } from 'react';
import { ScreenshotProvider } from '~/lib/contexts/ScreenshotContext';

interface ScreenshotStateManagerProps {
  setUploadedFiles?: (files: File[]) => void;
  setImageDataList?: (dataList: string[]) => void;
  uploadedFiles: File[];
  imageDataList: string[];
  children?: ReactNode;
}

export const ScreenshotStateManager = ({
  setUploadedFiles,
  setImageDataList,
  uploadedFiles,
  imageDataList,
  children,
}: ScreenshotStateManagerProps) => {
  if (!setUploadedFiles || !setImageDataList) {
    return <>{children}</>;
  }

  return (
    <ScreenshotProvider
      uploadedFiles={uploadedFiles}
      setUploadedFiles={setUploadedFiles}
      imageDataList={imageDataList}
      setImageDataList={setImageDataList}
    >
      {children}
    </ScreenshotProvider>
  );
};
