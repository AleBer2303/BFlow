import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { pickAndCompressProfilePhoto as pickNativeProfilePhoto } from '../profilePhotoPicker.native';
import {
  PROFILE_PHOTO_DATA_URI_MAX_LENGTH,
  PROFILE_PHOTO_TARGET_SIZE_PX,
} from '../profilePhotoValidation';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: {
    manipulate: jest.fn(),
  },
}));

describe('profilePhotoPicker.native: compression + Base64 pipeline (ADR 0033)', () => {
  const mockCrop = jest.fn();
  const mockResize = jest.fn();
  const mockSaveAsync = jest.fn();
  const mockRenderAsync = jest.fn();
  const mockContextRelease = jest.fn();
  const mockRenderedRelease = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    mockRenderAsync.mockResolvedValue({
      saveAsync: mockSaveAsync,
      release: mockRenderedRelease,
    });
    (ImageManipulator.manipulate as jest.Mock).mockReturnValue({
      crop: mockCrop,
      resize: mockResize,
      renderAsync: mockRenderAsync,
      release: mockContextRelease,
    });
  });

  it('center-crops non-square photos, resizes to 256x256, compresses to JPEG, and encodes clean Base64', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', width: 1200, height: 800 }],
    });
    mockSaveAsync.mockResolvedValue({
      uri: 'file:///compressed.jpg',
      width: 256,
      height: 256,
      base64: '/9j/4AAQ\nSkZJRg==\r\n',
    });

    const result = await pickNativeProfilePhoto();

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///photo.jpg');
    expect(mockCrop).toHaveBeenCalledWith({
      originX: 200,
      originY: 0,
      width: 800,
      height: 800,
    });
    expect(mockResize).toHaveBeenCalledWith({
      width: PROFILE_PHOTO_TARGET_SIZE_PX,
      height: PROFILE_PHOTO_TARGET_SIZE_PX,
    });
    expect(mockSaveAsync).toHaveBeenCalledWith({
      compress: 0.72,
      format: SaveFormat.JPEG,
      base64: true,
    });
    expect(result).toEqual({
      status: 'picked',
      dataUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    });
    expect(mockRenderedRelease).toHaveBeenCalledTimes(1);
    expect(mockContextRelease).toHaveBeenCalledTimes(1);
  });

  it('steps down JPEG compression quality automatically if the first pass exceeds the Firestore limit', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///dense.png', width: 512, height: 512 }],
    });
    mockSaveAsync
      .mockResolvedValueOnce({
        base64: 'A'.repeat(PROFILE_PHOTO_DATA_URI_MAX_LENGTH),
      })
      .mockResolvedValueOnce({
        base64: '/9j/4AAQSkZJRg==',
      });

    const result = await pickNativeProfilePhoto();

    expect(mockCrop).not.toHaveBeenCalled();
    expect(mockSaveAsync).toHaveBeenNthCalledWith(1, {
      compress: 0.72,
      format: SaveFormat.JPEG,
      base64: true,
    });
    expect(mockSaveAsync).toHaveBeenNthCalledWith(2, {
      compress: 0.52,
      format: SaveFormat.JPEG,
      base64: true,
    });
    expect(result).toEqual({
      status: 'picked',
      dataUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    });
  });

  it('returns an error when gallery permission is denied', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });

    const result = await pickNativeProfilePhoto();
    expect(result.status).toBe('error');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});
