export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function writeStored(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function processImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(
      "Please choose a JPEG, PNG or WebP image. For HEIC photos, export as JPEG first.",
    );
  if (file.size > 20 * 1024 * 1024)
    throw Error("Please choose a photo smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 60_000_000) {
    bitmap.close();
    throw Error("This image is too large. Choose a smaller photo.");
  }
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Image processing is unavailable.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}

export async function processAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name))
    throw Error("Choose a photo from your device.");
  if (file.size > 20 * 1024 * 1024) throw Error("Choose a photo smaller than 20 MB.");
  let bitmap: ImageBitmap | null = null;
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  try {bitmap = await createImageBitmap(file);} catch {bitmap = null;}
  if (bitmap) {source = bitmap;width = bitmap.width;height = bitmap.height;}
  else {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(Error("This photo format could not be opened on this device."));
        element.src = url;
      });
      source = image;width = image.naturalWidth;height = image.naturalHeight;
    } finally {URL.revokeObjectURL(url);}
  }
  try {
    if (!width || !height || width * height > 60_000_000) throw Error("This photo is too large.");
    const side = Math.min(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw Error("Photo editing is unavailable.");
    context.drawImage(source, (width-side)/2, (height-side)/2, side, side, 0, 0, 256, 256);
    const avatar = canvas.toDataURL("image/jpeg", 0.82);
    if (avatar.length > 150000) throw Error("This profile photo could not be saved. Choose another photo.");
    return avatar;
  } finally { bitmap?.close(); }
}
