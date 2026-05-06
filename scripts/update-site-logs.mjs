import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const dataPath = join(repoRoot, 'src/data/site-logs.json');
const schemaPath = join(repoRoot, 'scripts/site-log-summary.schema.json');

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const readArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const useLlm = hasArg('--llm');
const stagedMode = hasArg('--staged');
const backfillMode = hasArg('--backfill');
const commitMessageFile = readArg('--commit-message-file');
const targetDate = readArg('--date') ?? today();

if (hasArg('--help')) {
  console.log(`Usage:
  node scripts/update-site-logs.mjs --staged --commit-message-file .git/COMMIT_EDITMSG --llm
  node scripts/update-site-logs.mjs --backfill --llm
  node scripts/update-site-logs.mjs --date YYYY-MM-DD

Rules:
  --staged updates only today and is intended for the git commit hook.
  --backfill adds missing historical dates without rewriting existing past dates.
  --llm asks Codex CLI to generate en, ja, and zh-CN summaries.
`);
  process.exit(0);
}

const siteLogs = loadSiteLogs();

if (stagedMode) {
  if (targetDate !== today()) {
    throw new Error(`The commit hook only updates today's log (${today()}); received ${targetDate}.`);
  }
  const entry = buildStagedEntry(targetDate, commitMessageFile, useLlm);
  upsertEntry(siteLogs, targetDate, entry);
  saveSiteLogs(siteLogs);
} else if (backfillMode) {
  const commits = listCommittedHistory();
  for (const commit of commits.slice().reverse()) {
    const existingDay = siteLogs.find((day) => day.date === commit.date);
    const existingItem = existingDay?.items.some((item) => item.id === commit.id);

    if (existingItem) {
      continue;
    }

    if (existingDay && commit.date !== today()) {
      continue;
    }

    const entry = {
      id: commit.id,
      commitSubject: commit.subject,
      summary: summarizeCommit(commit.subject, commit.context, useLlm),
    };
    upsertEntry(siteLogs, commit.date, entry);
  }
  saveSiteLogs(siteLogs);
} else {
  const commits = listCommittedHistory().filter((commit) => commit.date === targetDate);
  for (const commit of commits.slice().reverse()) {
    const entry = {
      id: commit.id,
      commitSubject: commit.subject,
      summary: summarizeCommit(commit.subject, commit.context, useLlm),
    };
    upsertEntry(siteLogs, targetDate, entry);
  }
  saveSiteLogs(siteLogs);
}

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadSiteLogs() {
  if (!existsSync(dataPath)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(dataPath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('src/data/site-logs.json must contain an array.');
  }
  return parsed;
}

function saveSiteLogs(days) {
  days.sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync(dataPath, `${JSON.stringify(days, null, 2)}\n`);
}

function buildStagedEntry(date, messageFile, llm) {
  const subject = readCommitSubject(messageFile);
  const context = [
    `Commit subject: ${subject}`,
    '',
    'Staged files:',
    runGit(['diff', '--cached', '--name-status']),
    '',
    'Staged diff summary:',
    runGit(['diff', '--cached', '--stat']),
    '',
    'Staged diff excerpt:',
    trim(runGit(['diff', '--cached', '--', ':(exclude)src/data/site-logs.json']), 18000),
  ].join('\n');

  const digest = createHash('sha256').update(`${subject}\n${context}`).digest('hex').slice(0, 10);
  return {
    id: `${date}-pending-${digest}`,
    commitSubject: subject,
    summary: summarizeCommit(subject, context, llm),
  };
}

function readCommitSubject(messageFile) {
  if (!messageFile) {
    return 'Update site';
  }

  const raw = readFileSync(messageFile, 'utf8');
  const subject = raw
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));

  return subject ?? 'Update site';
}

function listCommittedHistory() {
  const output = runGit(['log', '--date=short', '--pretty=format:%H%x1f%h%x1f%ad%x1f%s']);
  if (!output.trim()) {
    return [];
  }

  return output.split('\n').map((line) => {
    const [fullHash, shortHash, date, subject] = line.split('\x1f');
    return {
      id: `${date}-${shortHash}`,
      fullHash,
      shortHash,
      date,
      subject,
      context: [
        `Commit subject: ${subject}`,
        `Commit hash: ${fullHash}`,
        '',
        'Changed files:',
        runGit(['show', '--stat', '--format=', fullHash]),
      ].join('\n'),
    };
  });
}

function summarizeCommit(subject, context, llm) {
  if (!llm) {
    return {
      en: subject,
      ja: subject,
      'zh-CN': subject,
    };
  }

  const prompt = `You generate concise public changelog entries for a static personal toolbox website.

Return one JSON object that matches the provided schema.

Requirements:
- Generate all three locales: en, ja, zh-CN.
- Each locale must be one short user-facing sentence.
- Summarize what changed, not how git works.
- Do not mention commit hashes.
- Do not invent features not supported by the commit context.
- Keep tone plain and factual.

Commit context:
${context}`;

  const outputDir = mkdtempSync(join(tmpdir(), 'udon-site-log-'));
  const outputPath = join(outputDir, 'summary.json');
  const result = spawnSync(
    'codex',
    [
      'exec',
      '--cd',
      repoRoot,
      '--ephemeral',
      '--output-schema',
      schemaPath,
      '--output-last-message',
      outputPath,
      '--color',
      'never',
      '-',
    ],
    {
      cwd: repoRoot,
      input: prompt,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8,
    },
  );

  if (result.status !== 0) {
    rmSync(outputDir, { recursive: true, force: true });
    const stderr = result.stderr?.trim() || result.stdout?.trim() || 'unknown Codex CLI failure';
    throw new Error(`Codex summary generation failed: ${stderr}`);
  }

  try {
    const raw = readFileSync(outputPath, 'utf8').trim();
    const parsed = JSON.parse(raw);
    return parsed.summary;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

function upsertEntry(days, date, entry) {
  let day = days.find((candidate) => candidate.date === date);
  if (!day) {
    day = { date, items: [] };
    days.push(day);
  }

  const existingIndex = day.items.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) {
    day.items[existingIndex] = entry;
    return;
  }

  const pendingIndex = day.items.findIndex(
    (item) =>
      item.commitSubject &&
      item.commitSubject === entry.commitSubject &&
      typeof item.id === 'string' &&
      item.id.includes('-pending-'),
  );
  if (pendingIndex >= 0) {
    day.items[pendingIndex] = entry;
    return;
  }

  day.items.unshift(entry);
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

function trim(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n[truncated]`;
}
