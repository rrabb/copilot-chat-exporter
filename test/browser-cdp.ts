import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class BrowserCdp {
  readonly socket: WebSocket;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  constructor (socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message: { id: number; result: unknown; error?: object } = JSON.parse(String(event.data));
      const request = this.pending.get(message.id);
      if (!request)
        return;
      this.pending.delete(message.id);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    });
  }
  static async open (url: string): Promise<BrowserCdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`Cannot connect to ${url}`)), { once: true });
    });
    return new BrowserCdp(socket);
  }
  send<T = object> (method: string, params: object = {}): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30_000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value as T); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate<T> (expression: string): Promise<T> {
    const response = await this.send<{ result: { value: T }; exceptionDetails?: object }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails)
      throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
}

export async function launchTestBrowser () {
  const candidates = process.env.CCE_TEST_BROWSER ? [process.env.CCE_TEST_BROWSER] : process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  let executable: string | undefined;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      executable = candidate;
      break;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
        throw error;
    }
  }
  if (!executable) {
    if (process.env.CCE_TEST_BROWSER)
      throw new Error(`CCE_TEST_BROWSER does not exist: ${process.env.CCE_TEST_BROWSER}`);
    return null;
  }
  const root = fileURLToPath(new URL('../temp-tool-output/', import.meta.url));
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'compressed-resave-test-'));
  const profile = path.join(directory, 'profile');
  const child = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  let browser: BrowserCdp | undefined;
  try {
    let port: string | undefined;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw new Error(`Test browser exited with ${child.exitCode}.`);
      try {
        const publishedPort = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim();
        if (/^\d+$/u.test(publishedPort)) {
          port = publishedPort;
          break;
        }
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || !['ENOENT', 'EBUSY'].includes(String(error.code)))
          throw error;
      }
      await delay(100);
    }
    if (!port)
      throw new Error('Test browser did not publish its debugger port.');
    const endpoint = `http://127.0.0.1:${port}`;
    const version = await (await fetch(`${endpoint}/json/version`)).json();
    if (!version || typeof version !== 'object' || !('webSocketDebuggerUrl' in version) || typeof version.webSocketDebuggerUrl !== 'string' || !('Browser' in version) || typeof version.Browser !== 'string')
      throw new Error('Invalid test-browser version response.');
    browser = await BrowserCdp.open(version.webSocketDebuggerUrl);
    const connection = browser;
    return {
      directory,
      version: version.Browser,
      async page () {
        const { browserContextId } = await connection.send<{ browserContextId: string }>('Target.createBrowserContext');
        const { targetId } = await connection.send<{ targetId: string }>('Target.createTarget', { browserContextId, url: 'about:blank' });
        const pages = await (await fetch(`${endpoint}/json/list`)).json();
        if (!Array.isArray(pages))
          throw new Error('Invalid test-browser page list.');
        const target = pages.find(page => page.id === targetId);
        if (!target || typeof target.webSocketDebuggerUrl !== 'string')
          throw new Error('Test browser page was not found.');
        const page = await BrowserCdp.open(target.webSocketDebuggerUrl);
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        return {
          page,
          close: async () => { page.socket.close(); await connection.send('Target.disposeBrowserContext', { browserContextId }); },
        };
      },
      async close () {
        await connection.send('Browser.close');
        connection.socket.close();
        await Promise.race([exited, delay(5000)]);
        child.exitCode === null && child.kill();
        await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      },
    };
  } catch (error) {
    browser?.socket.close();
    child.kill();
    await Promise.race([exited, delay(5000)]);
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    throw error;
  }
}
