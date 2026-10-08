import sharp from "sharp";

/**
 * Traitement d'une image uploadée. Rien n'est conservé de l'original : le
 * fichier est décodé puis ré-encodé en WebP (métadonnées EXIF/GPS supprimées,
 * orientation appliquée). Le type est déterminé par les OCTETS, jamais par
 * l'extension ni le Content-Type envoyés par le client. SVG et GIF refusés.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 40_000_000; // ~ 6300×6300 : bombe de décompression refusée
export const MIN_SIDE = 100;
export const FULL_MAX_SIDE = 1920;
export const THUMB_MAX_SIDE = 480;

export type DetectedType = "jpeg" | "png" | "webp";

export function detectImageType(b: Uint8Array): DetectedType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)
  ) return "png";
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.subarray(8, 12)) === "WEBP"
  ) return "webp";
  return null;
}

export type ImageErrorCode = "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE" | "INVALID_IMAGE" | "BAD_DIMENSIONS";
export class ImageError extends Error {
  constructor(public code: ImageErrorCode) {
    super(code);
  }
}

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

sharp.cache(false); // petit VPS : pas de cache mémoire de libvips
sharp.concurrency(1);

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw new ImageError("EMPTY");
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageError("TOO_LARGE");
  if (!detectImageType(input)) throw new ImageError("UNSUPPORTED_TYPE");

  try {
    const open = () =>
      sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false });
    const meta = await open().metadata();
    if (!meta.width || !meta.height) throw new ImageError("INVALID_IMAGE");
    // Après rotation EXIF, largeur/hauteur peuvent être permutées : on borne le plus petit côté.
    if (Math.min(meta.width, meta.height) < MIN_SIDE) throw new ImageError("BAD_DIMENSIONS");

    const encode = async (side: number, quality: number) => {
      const { data, info } = await open()
        .rotate()
        .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      return { data, info };
    };
    const full = await encode(FULL_MAX_SIDE, 82);
    const thumb = await encode(THUMB_MAX_SIDE, 75);
    return { full: full.data, thumb: thumb.data, width: full.info.width, height: full.info.height };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    const msg = e instanceof Error ? e.message : "";
    if (/pixel limit|exceeds/i.test(msg)) throw new ImageError("BAD_DIMENSIONS");
    throw new ImageError("INVALID_IMAGE");
  }
}
