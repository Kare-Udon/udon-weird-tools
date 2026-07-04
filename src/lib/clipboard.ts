const CLIPBOARD_WRITE_TIMEOUT_MS = 750;
const CLIPBOARD_READ_TIMEOUT_MS = 750;

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (copyWithTextarea(text)) {
    return true;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    if (await writeWithClipboardApi(text)) {
      return true;
    }
  }

  return false;
}

export async function readTextFromClipboard(): Promise<string | null> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.readText !== 'function') {
    return null;
  }

  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      navigator.clipboard.readText(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Clipboard read timed out.')), CLIPBOARD_READ_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

function copyWithTextarea(text: string): boolean {
  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto -9999px';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function writeWithClipboardApi(text: string): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Clipboard write timed out.')), CLIPBOARD_WRITE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}
