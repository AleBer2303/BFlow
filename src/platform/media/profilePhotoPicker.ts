/**
 * src/platform/media/profilePhotoPicker.ts
 *
 * Web / default profile photo picker and client-side square JPEG compressor (ADR 0033).
 * Uses an offscreen `<input type="file">` and `<canvas>` (256x256 cover crop) so profile avatars
 * stay lightweight (~10-25 KB) for Cloud Firestore (`users/{uid}.photoUrl`) with zero native deps.
 */

import {
  PROFILE_PHOTO_DATA_URI_MAX_LENGTH,
  PROFILE_PHOTO_TARGET_SIZE_PX,
  isValidProfilePhotoUri,
} from './profilePhotoValidation';

export type PickProfilePhotoResult =
  | { status: 'picked'; dataUri: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const WEB_QUALITY_STEPS = [0.78, 0.62, 0.46, 0.32] as const;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo leer la imagen seleccionada.'));
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
    img.src = src;
  });
}

export async function compressImageDataUrlForWeb(rawDataUrl: string): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('No se puede procesar imágenes en este entorno.');
  }
  const img = await loadHtmlImage(rawDataUrl);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;
  if (!(srcWidth > 0) || !(srcHeight > 0)) {
    throw new Error('La imagen seleccionada no tiene dimensiones válidas.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = PROFILE_PHOTO_TARGET_SIZE_PX;
  canvas.height = PROFILE_PHOTO_TARGET_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No fue posible procesar la imagen en este navegador.');
  }

  // Center-crop square (cover fit) before resizing to 256x256.
  const cropSide = Math.min(srcWidth, srcHeight);
  const sx = Math.floor((srcWidth - cropSide) / 2);
  const sy = Math.floor((srcHeight - cropSide) / 2);
  ctx.drawImage(
    img,
    sx,
    sy,
    cropSide,
    cropSide,
    0,
    0,
    PROFILE_PHOTO_TARGET_SIZE_PX,
    PROFILE_PHOTO_TARGET_SIZE_PX
  );

  for (const quality of WEB_QUALITY_STEPS) {
    const candidate = canvas.toDataURL('image/jpeg', quality);
    if (
      candidate.length <= PROFILE_PHOTO_DATA_URI_MAX_LENGTH &&
      isValidProfilePhotoUri(candidate)
    ) {
      return candidate;
    }
  }

  throw new Error('La imagen es demasiado grande incluso comprimida. Prueba con otra foto.');
}

export async function pickAndCompressProfilePhoto(): Promise<PickProfilePhotoResult> {
  if (typeof document === 'undefined') {
    return {
      status: 'error',
      message: 'La selección de fotos no está disponible en este entorno.',
    };
  }

  return new Promise<PickProfilePhotoResult>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.style.display = 'none';

    let settled = false;
    const finish = (result: PickProfilePhotoResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', handleWindowFocus);
      input.remove();
      resolve(result);
    };

    const handleWindowFocus = () => {
      // Allow the `change` event to fire first if a file was picked.
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          finish({ status: 'cancelled' });
        }
      }, 350);
    };

    input.oncancel = () => finish({ status: 'cancelled' });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        finish({ status: 'cancelled' });
        return;
      }
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        finish({
          status: 'error',
          message: 'Selecciona una imagen JPG, PNG o WebP.',
        });
        return;
      }
      try {
        const rawDataUrl = await readFileAsDataUrl(file);
        const compressed = await compressImageDataUrlForWeb(rawDataUrl);
        finish({ status: 'picked', dataUri: compressed });
      } catch (err) {
        finish({
          status: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'No fue posible procesar la foto seleccionada.',
        });
      }
    };

    document.body.appendChild(input);
    window.addEventListener('focus', handleWindowFocus, { once: true });
    input.click();
  });
}
