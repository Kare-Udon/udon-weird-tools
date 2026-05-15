const CLIPBOARD_WRITE_TIMEOUT_MS = 750;

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;

  if (copyWithTextarea(value)) {
    return true;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    if (await writeWithClipboardApi(value)) {
      return true;
    }
  }

  return false;
}

function copyWithTextarea(value: string): boolean {
  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto -9999px';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function writeWithClipboardApi(value: string): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    await Promise.race([
      navigator.clipboard.writeText(value),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Clipboard write timed out.')), CLIPBOARD_WRITE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    // Fall through to the legacy path. Clipboard permissions differ across browsers.
    return false;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}
