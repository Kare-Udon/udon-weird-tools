import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(repoRoot, 'start-test-server.sh');

async function writeExecutable(filePath, content) {
  await writeFile(filePath, content, { mode: 0o755 });
}

async function waitForFileContent(filePath, matcher, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await readFile(filePath, 'utf8');
      if (matcher.test(content)) {
        return content;
      }
    } catch {
      // The file may not exist until the fake command writes its first call.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return readFile(filePath, 'utf8');
}

test('start-test-server.sh stops existing port listeners and starts Astro dev on the requested port', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'udon-test-server-'));
  const fakeBin = path.join(tempDir, 'bin');
  const callsFile = path.join(tempDir, 'calls.log');
  const lsofStateFile = path.join(tempDir, 'lsof-state');
  const pidFile = path.join(tempDir, 'server.pid');
  const logFile = path.join(tempDir, 'server.log');
  const existingServer = spawn('sleep', ['30'], { stdio: 'ignore' });
  t.after(() => {
    try {
      existingServer.kill('SIGKILL');
    } catch {
      // The test expects this process to already be stopped by the script.
    }
  });

  await import('node:fs/promises').then(({ mkdir }) => mkdir(fakeBin));

  await writeExecutable(
    path.join(fakeBin, 'lsof'),
    `#!/usr/bin/env bash
printf 'lsof %s\\n' "$*" >> "${callsFile}"
if [[ ! -f "${lsofStateFile}" ]]; then
  touch "${lsofStateFile}"
  echo ${existingServer.pid}
fi
`,
  );

  await writeExecutable(
    path.join(fakeBin, 'npm'),
    `#!/usr/bin/env bash
printf 'npm %s\\n' "$*" >> "${callsFile}"
sleep 2
`,
  );

  const child = spawn('bash', [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      UDON_TEST_SERVER_PORT: '4987',
      UDON_TEST_SERVER_PID_FILE: pidFile,
      UDON_TEST_SERVER_LOG_FILE: logFile,
      UDON_TEST_SERVER_WAIT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const [exitCode, stdout, stderr] = await new Promise((resolve) => {
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('close', (code) => resolve([code, out, err]));
  });

  assert.equal(exitCode, 0, stderr);
  assert.match(stdout, /http:\/\/127\.0\.0\.1:4987/);

  const calls = await waitForFileContent(
    callsFile,
    /npm run dev -- --host 127\.0\.0\.1 --port 4987/,
  );
  assert.match(calls, /lsof -tiTCP:4987 -sTCP:LISTEN/);
  assert.match(calls, /npm run dev -- --host 127\.0\.0\.1 --port 4987/);
  assert.doesNotMatch(calls, /strictPort/);

  const launchedPid = Number(await readFile(pidFile, 'utf8'));
  assert.ok(Number.isInteger(launchedPid) && launchedPid > 0);

  if (existingServer.signalCode === null && existingServer.exitCode === null) {
    await new Promise((resolve) => existingServer.once('exit', resolve));
  }
  assert.equal(existingServer.signalCode, 'SIGTERM');
});

test('start-test-server.sh starts when no process is listening on the requested port', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'udon-test-server-empty-port-'));
  const fakeBin = path.join(tempDir, 'bin');
  const callsFile = path.join(tempDir, 'calls.log');
  const pidFile = path.join(tempDir, 'server.pid');
  const logFile = path.join(tempDir, 'server.log');

  await import('node:fs/promises').then(({ mkdir }) => mkdir(fakeBin));

  await writeExecutable(
    path.join(fakeBin, 'lsof'),
    `#!/usr/bin/env bash
printf 'lsof %s\\n' "$*" >> "${callsFile}"
exit 0
`,
  );

  await writeExecutable(
    path.join(fakeBin, 'npm'),
    `#!/usr/bin/env bash
printf 'npm %s\\n' "$*" >> "${callsFile}"
sleep 2
`,
  );

  const child = spawn('bash', [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      UDON_TEST_SERVER_PORT: '4988',
      UDON_TEST_SERVER_PID_FILE: pidFile,
      UDON_TEST_SERVER_LOG_FILE: logFile,
      UDON_TEST_SERVER_WAIT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const [exitCode, stdout, stderr] = await new Promise((resolve) => {
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('close', (code) => resolve([code, out, err]));
  });

  assert.equal(exitCode, 0, stderr);
  assert.match(stdout, /http:\/\/127\.0\.0\.1:4988/);

  const calls = await waitForFileContent(
    callsFile,
    /npm run dev -- --host 127\.0\.0\.1 --port 4988/,
  );
  assert.match(calls, /lsof -tiTCP:4988 -sTCP:LISTEN/);
  assert.doesNotMatch(calls, /strictPort/);
});
