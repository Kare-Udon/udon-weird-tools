import type { Model as VoskModel } from 'vosk-browser';

type VoskBrowserGlobal = {
  createModel(modelUrl: string, logLevel?: number): Promise<VoskModel>;
};

declare global {
  interface Window {
    Vosk?: VoskBrowserGlobal;
  }
}

const VOSK_BROWSER_SCRIPT_URL = '/vendor/vosk/vosk.js';

let loadVoskBrowserPromise: Promise<VoskBrowserGlobal> | null = null;

export async function createVoskModel(modelUrl: string, logLevel = 0): Promise<VoskModel> {
  const vosk = await loadVoskBrowser();
  return vosk.createModel(modelUrl, logLevel);
}

async function loadVoskBrowser(): Promise<VoskBrowserGlobal> {
  if (typeof window === 'undefined') {
    throw new Error('Vosk can only run in a browser.');
  }

  if (window.Vosk?.createModel) {
    return window.Vosk;
  }

  loadVoskBrowserPromise ??= new Promise<VoskBrowserGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${VOSK_BROWSER_SCRIPT_URL}"]`);
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => {
      if (window.Vosk?.createModel) {
        resolve(window.Vosk);
        return;
      }
      reject(new Error('Vosk browser runtime did not initialize.'));
    }, { once: true });

    script.addEventListener('error', () => {
      reject(new Error('Unable to load Vosk browser runtime.'));
    }, { once: true });

    if (!existing) {
      script.src = VOSK_BROWSER_SCRIPT_URL;
      script.async = true;
      document.head.append(script);
    }
  });

  return loadVoskBrowserPromise;
}
