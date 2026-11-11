/** Client-side prep for box art: shrink to a square-ish 512px WebP so the pin stays small. */

export const ART_PX = 512;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not an image the browser can read.'));
    };
    img.src = url;
  });
}

/** Returns the file untouched when it is already small; GIFs keep their frames and are never re-encoded. */
export async function prepareArt(file: File, maxBytes: number): Promise<File> {
  if (file.type === 'image/gif') {
    if (file.size > maxBytes) throw new Error('GIFs are capped at 1 MB.');
    return file;
  }
  const img = await loadImage(file);
  const scale = Math.min(1, ART_PX / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size <= maxBytes) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.86));
  if (!blob) throw new Error('Could not resize the image.');
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
}

export async function uploadArt(file: File): Promise<string> {
  const form = new FormData();
  form.set('file', file);
  const r = await fetch('/api/upload', { method: 'POST', body: form });
  const body = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !body.url) throw new Error(body.error ?? 'Upload failed.');
  return body.url;
}
