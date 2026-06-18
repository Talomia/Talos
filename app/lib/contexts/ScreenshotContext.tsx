import { createContext, useContext, type ReactNode } from 'react';

export interface ScreenshotContextValue {
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  imageDataList: string[];
  setImageDataList: (dataList: string[]) => void;
}

const ScreenshotContext = createContext<ScreenshotContextValue | null>(null);

interface ScreenshotProviderProps {
  children: ReactNode;
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  imageDataList: string[];
  setImageDataList: (dataList: string[]) => void;
}

export function ScreenshotProvider({
  children,
  uploadedFiles,
  setUploadedFiles,
  imageDataList,
  setImageDataList,
}: ScreenshotProviderProps) {
  return (
    <ScreenshotContext.Provider value={{ uploadedFiles, setUploadedFiles, imageDataList, setImageDataList }}>
      {children}
    </ScreenshotContext.Provider>
  );
}

export function useScreenshotContext(): ScreenshotContextValue {
  const ctx = useContext(ScreenshotContext);

  if (!ctx) {
    throw new Error('useScreenshotContext must be used within a <ScreenshotProvider>');
  }

  return ctx;
}
