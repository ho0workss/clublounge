/**
 * Image helpers for pictures that are stored inline (as data URLs) inside
 * `cl_records.data` / `cl_branding.logo_url`.
 *
 * Every stored byte is re-downloaded on each list fetch, so these images are
 * the single biggest driver of database size and egress. Keep them small:
 * WebP at a modest edge length is roughly 10-20x cheaper than the raw file.
 */

/** Longest-edge budget, in px, per kind of inline image. */
export const IMAGE_MAX_PX = {
  /** 주류 사진 — rendered in a ~44px row thumbnail / small preview. */
  liquor: 220,
  /** 소속 로고 — rendered in the header at ~32-40px. */
  logo: 256,
} as const;

export async function loadImageFile(file: File): Promise<HTMLImageElement> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("파일을 읽을 수 없습니다."));
    fr.readAsDataURL(file);
  });
  return await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("이미지를 읽을 수 없습니다."));
    im.src = dataUrl;
  });
}

/**
 * Downscale to `max` on the longest edge and encode compactly.
 * Prefers WebP (keeps transparency, ~30% smaller than JPEG); falls back to
 * JPEG, then PNG, on browsers that cannot encode WebP.
 */
export function shrinkToDataUrl(
  img: HTMLImageElement,
  max: number,
  quality = 0.7
): string {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

  for (const type of ["image/webp", "image/jpeg", "image/png"]) {
    const url = canvas.toDataURL(type, quality);
    // A browser that cannot encode `type` silently returns a PNG instead.
    if (url.startsWith(`data:${type}`)) return url;
  }
  return canvas.toDataURL();
}

/** Read an image file and return a storage-ready, downscaled data URL. */
export async function fileToStoredImage(
  file: File,
  max: number,
  quality = 0.7
): Promise<string> {
  return shrinkToDataUrl(await loadImageFile(file), max, quality);
}
