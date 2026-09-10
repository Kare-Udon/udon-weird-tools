const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

export class CdpClient {
  constructor(webSocketUrl, { commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
    this.webSocketUrl = webSocketUrl;
    this.commandTimeoutMs = commandTimeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = null;
  }

  async connect() {
    if (this.socket) return this;

    const socket = new WebSocket(this.webSocketUrl);
    this.socket = socket;

    await new Promise((resolve, reject) => {
      const handleOpen = () => {
        socket.removeEventListener('error', handleError);
        resolve();
      };
      const handleError = (event) => {
        socket.removeEventListener('open', handleOpen);
        reject(new Error(`CDP WebSocket 连接失败：${describeEvent(event)}`));
      };

      socket.addEventListener('open', handleOpen, { once: true });
      socket.addEventListener('error', handleError, { once: true });
    });

    socket.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });
    socket.addEventListener('close', () => {
      const error = new Error('CDP WebSocket 已关闭。');
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
    });

    return this;
  }

  async send(method, params = {}, { timeoutMs = this.commandTimeoutMs } = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`CDP 尚未连接，无法调用 ${method}。`);
    }

    const id = this.nextId;
    this.nextId += 1;

    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 调用超时（${timeoutMs} ms）：${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
    });

    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  async waitForEvent(method, { timeoutMs = this.commandTimeoutMs, predicate = () => true } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`等待 CDP 事件超时（${timeoutMs} ms）：${method}`));
      }, timeoutMs);
      const unsubscribe = this.on(method, (params) => {
        let matches = false;
        try {
          matches = predicate(params);
        } catch (error) {
          clearTimeout(timer);
          unsubscribe();
          reject(error);
          return;
        }
        if (!matches) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(params);
      });
    });
  }

  async close() {
    if (!this.socket) return;

    const socket = this.socket;
    this.socket = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        socket.addEventListener('close', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }
  }

  handleMessage(rawData) {
    const text = typeof rawData === 'string'
      ? rawData
      : rawData instanceof ArrayBuffer
        ? new TextDecoder().decode(new Uint8Array(rawData))
        : Buffer.from(rawData).toString('utf8');
    const message = JSON.parse(text);

    if (message.id != null) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(`CDP ${pending.method} 失败：${message.error.message ?? JSON.stringify(message.error)}`));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }

    const listeners = this.listeners.get(message.method);
    if (!listeners) return;
    for (const listener of listeners) listener(message.params ?? {});
  }
}

export async function connectCdp(webSocketUrl, options) {
  return new CdpClient(webSocketUrl, options).connect();
}

export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}：${url}`);
  return response.json();
}

export async function waitForJson(url, { timeoutMs = 15_000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  }

  throw new Error(`等待 HTTP JSON 超时（${timeoutMs} ms）：${url}；最后错误：${lastError?.message ?? 'unknown'}`);
}

export async function waitForHttp(url, { timeoutMs = 30_000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      return { status: response.status, headers: Object.fromEntries(response.headers) };
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  }

  throw new Error(`等待 HTTP 服务超时（${timeoutMs} ms）：${url}；最后错误：${lastError?.message ?? 'unknown'}`);
}

export function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function describeEvent(event) {
  if (event instanceof Error) return event.message;
  if (event?.message) return event.message;
  return String(event ?? 'unknown error');
}
