import { useEffect } from 'react';

interface ScreenshotStateManagerProps {
  setUploadedFiles?: (files: File[]) => void;
  setImageDataList?: (dataList: string[]) => void;
  uploadedFiles: File[];
  imageDataList: string[];
}

export const ScreenshotStateManager = ({
  setUploadedFiles,
  setImageDataList,
  uploadedFiles,
  imageDataList,
}: ScreenshotStateManagerProps) => {
  useEffect(() => {
    if (setUploadedFiles && setImageDataList) {
      const win = window as unknown as Record<string, unknown>;
      win.__BOLT_SET_UPLOADED_FILES__ = setUploadedFiles;
      win.__BOLT_SET_IMAGE_DATA_LIST__ = setImageDataList;
      win.__BOLT_UPLOADED_FILES__ = uploadedFiles;
      win.__BOLT_IMAGE_DATA_LIST__ = imageDataList;
    }

    return () => {
      const win = window as unknown as Record<string, unknown>;
      delete win.__BOLT_SET_UPLOADED_FILES__;
      delete win.__BOLT_SET_IMAGE_DATA_LIST__;
      delete win.__BOLT_UPLOADED_FILES__;
      delete win.__BOLT_IMAGE_DATA_LIST__;
    };
  }, [setUploadedFiles, setImageDataList, uploadedFiles, imageDataList]);

  return null;
};
