/** Browser file helpers (download / pick a local file). */

export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function downloadDataUrl(fileName: string, dataUrl: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

export const MAX_IMPORT_SIZE = 2_000_000;

/** Reads a user-chosen file as text, or as a data: URL for images. */
export function readLocalFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMPORT_SIZE) {
      reject(new Error(`Fichier trop volumineux (maximum ${MAX_IMPORT_SIZE / 1_000_000} Mo).`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('Lecture du fichier impossible.'));
    };
    if (file.type.startsWith('image/')) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

export function isImageData(content: string): boolean {
  return /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(content);
}
