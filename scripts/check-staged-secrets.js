#!/usr/bin/env node

const { execSync } = require('child_process');

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.yml', '.yaml', '.env', '.md', '.txt', '.py', '.sh', '.sql', '.toml', '.ini', '.xml', '.html', '.css', '.scss', '.mjs', '.cjs'
]);

const BLOCKED_FILE_PATTERNS = [
  /firebase-adminsdk.*\.json$/i,
  /serviceaccount.*\.json$/i,
  /(^|\/)\.env(\.|$)/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /id_rsa$/i,
  /id_ed25519$/i,
];

const SECRET_PATTERNS = [
  { name: 'AWS access key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'Google API key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: 'GitHub token', regex: /ghp_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}/g },
  { name: 'Slack token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
  { name: 'Private key block', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Connection string with password', regex: /(?:DATABASE_URL|REDIS_URL|MONGO_URL|MYSQL_URL|POSTGRES_URL)\s*=\s*[^\s]+:[^\s@]+@/gi },
  {
    name: 'Sensitive env assignment',
    regex: /^\s*(?:export\s+)?[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*[^\s#]{12,}/g,
  },
];

const SAFE_VALUE_HINTS = [
  'your_',
  'example',
  'changeme',
  'replace_me',
  'placeholder',
  '<',
  'xxx',
  'dummy',
  'sample',
];

function isLikelyTextFile(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.env')) return true;
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(lower.slice(dot));
}

function isExampleFile(filePath) {
  return /\.env\.example$/i.test(filePath) || /\.example\./i.test(filePath) || /example/i.test(filePath);
}

function isSafePlaceholder(line) {
  const normalized = line.toLowerCase();
  return SAFE_VALUE_HINTS.some((hint) => normalized.includes(hint));
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function getStagedFiles() {
  const out = run('git diff --cached --name-only --diff-filter=ACMR');
  if (!out) return [];
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function getStagedContent(filePath) {
  try {
    return run(`git show :"${filePath.replace(/"/g, '\\"')}"`);
  } catch (_) {
    return '';
  }
}

function main() {
  const files = getStagedFiles();
  if (files.length === 0) process.exit(0);

  const findings = [];

  for (const filePath of files) {
    if (BLOCKED_FILE_PATTERNS.some((pattern) => pattern.test(filePath)) && !isExampleFile(filePath)) {
      findings.push({ filePath, line: 0, reason: 'Blocked sensitive file pattern' });
      continue;
    }

    if (!isLikelyTextFile(filePath)) continue;

    const content = getStagedContent(filePath);
    if (!content) continue;
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(line)) {
          pattern.regex.lastIndex = 0;
          if (isExampleFile(filePath) || isSafePlaceholder(line)) {
            continue;
          }
          findings.push({
            filePath,
            line: idx + 1,
            reason: pattern.name,
          });
          break;
        }
        pattern.regex.lastIndex = 0;
      }
    });
  }

  if (findings.length > 0) {
    console.error('\nSecret scan failed. Potential sensitive data found in staged changes:\n');
    for (const finding of findings) {
      const where = finding.line > 0 ? `${finding.filePath}:${finding.line}` : finding.filePath;
      console.error(`- ${where} -> ${finding.reason}`);
    }
    console.error('\nCommit aborted. Remove or mask secrets, or move them to environment variables/secrets manager.');
    process.exit(1);
  }

  console.log('Secret scan passed.');
}

main();
