/**
 * src/platform/media/profilePhotoPicker.native.ts
 *
 * Native (iOS / Android) profile photo picker and 256x256 JPEG compressor (ADR 0033).
 * Uses `expo-image-picker` + `expo-image-manipulator` (both bundled in Expo Go SDK 58 and native builds).
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { PickProfilePhotoResult } from './profilePhotoPicker';
import {
  PROFILE_PHOTO_DATA_URI_MAX_LENGTH,
  PROFILE_PHOTO_TARGET_SIZE_PX,
  isValidProfilePhotoUri,
} from './profilePhotoValidation';

export type { PickProfilePhotoResult };

const NATIVE_QUALITY_STEPS = [0.72, 0.52, 0.36] as const;

export async function pickAndCompressProfilePhoto(): Promise<PickProfilePhotoResult> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return {
        status: 'error',
        message: 'Necesitamos permiso para acceder a tus fotos y elegir tu avatar.',
      };
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: false,
    });

    if (picked.canceled || !picked.assets?.[0]?.uri) {
      return { status: 'cancelled' };
    }

    const asset = picked.assets[0];
    const context = ImageManipulator.manipulate(asset.uri);
    if (
      typeof asset.width === 'number' &&
      typeof asset.height === 'number' &&
      asset.width > 0 &&
      asset.height > 0 &&
      asset.width !== asset.height
    ) {
      const side = Math.min(asset.width, asset.height);
      context.crop({
        originX: Math.floor((asset.width - side) / 2),
        originY: Math.floor((asset.height - side) / 2),
        width: side,
        height: side,
      });
    }
    context.resize({
      width: PROFILE_PHOTO_TARGET_SIZE_PX,
      height: PROFILE_PHOTO_TARGET_SIZE_PX,
    });

    const rendered = await context.renderAsync();
    try {
      for (const compress of NATIVE_QUALITY_STEPS) {
        const saved = await rendered.saveAsync({
          compress,
          format: SaveFormat.JPEG,
          base64: true,
        });
        if (!saved.base64) continue;
        // Android/iOS encoders may wrap Base64 lines with CR/LF; strip whitespace before building the Data URI.
        const cleanBase64 = saved.base64.replace(/\s+/g, '');
        if (!cleanBase64) continue;
        const dataUri = `data:image/jpeg;base64,${cleanBase64}`;
        if (
          dataUri.length <= PROFILE_PHOTO_DATA_URI_MAX_LENGTH &&
          isValidProfilePhotoUri(dataUri)
        ) {
          return { status: 'picked', dataUri };
        }
      }
    } finally {
      rendered.release?.();
      context.release?.();
    }

    return {
      status: 'error',
      message: 'La imagen es demasiado grande incluso comprimida. Prueba con otra foto.',
    };
  } catch (err) {
    return {
      status: 'error',
      message:
        err instanceof Error
          ? err.message
          : 'No fue posible seleccionar o procesar la foto de perfil.',
    };
  }
}
