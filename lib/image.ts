// Player photos: JPEG keeps them small (640px is sharp on the big stage card and well under
// Firestore's 1 MB document limit). Team logos: PNG keeps transparent backgrounds.
export const compressImage = (file: Blob & { name?: string }, maxSize = 640, quality = 0.72, type: "image/jpeg" | "image/png" = "image/jpeg") =>
  new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not prepare image"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(type, quality));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name ?? "image"} (unsupported format such as HEIC?)`));
    };
    image.src = url;
  });
