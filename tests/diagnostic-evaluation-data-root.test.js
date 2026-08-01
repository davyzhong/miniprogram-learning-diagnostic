'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { resolveDataRoot } = require('../evaluation/diagnostic-accuracy/data-root');

const repoRoot = path.resolve(__dirname, '..');
const homeDir = os.homedir();

test('rejects relative data roots with an absolute-path error', () => {
  assert.throws(
    () => resolveDataRoot({ value: 'evaluation-data', repoRoot, homeDir }),
    /absolute path/i,
  );
});

test('rejects empty data-root values', () => {
  for (const value of [undefined, null, '', '   ']) {
    assert.throws(
      () => resolveDataRoot({ value, repoRoot, homeDir }),
      /data root/i,
    );
  }
});

test('rejects filesystem roots', () => {
  assert.throws(
    () => resolveDataRoot({ value: path.parse(repoRoot).root, repoRoot, homeDir }),
    /filesystem root/i,
  );
});

test('rejects the repository and directories inside it', () => {
  for (const value of [repoRoot, path.join(repoRoot, 'evaluation-data')]) {
    assert.throws(
      () => resolveDataRoot({ value, repoRoot, homeDir }),
      /repository/i,
    );
  }
});

test('rejects synchronized-folder path segments case-insensitively', () => {
  const synchronizedSegments = [
    'Google Drive',
    'GoogleDrive',
    'iCloud',
    'Dropbox',
    'OneDrive',
    'Box',
  ];

  for (const segment of synchronizedSegments) {
    const value = path.join(path.parse(repoRoot).root, 'private', segment.toUpperCase(), 'evaluation');
    assert.throws(
      () => resolveDataRoot({ value, repoRoot, homeDir }),
      /synchronized/i,
      segment,
    );
  }
});

test('synchronized-folder checks are path-segment aware', () => {
  const value = path.join(path.parse(repoRoot).root, 'private', 'DropboxArchive', 'evaluation');
  assert.equal(resolveDataRoot({ value, repoRoot, homeDir }), path.normalize(value));
});

test('accepts a separate local absolute directory without creating it', () => {
  const value = path.join(
    os.tmpdir(),
    `ldx-eval-data-root-${process.pid}-${Date.now()}`,
  );

  assert.equal(fs.existsSync(value), false);
  assert.equal(resolveDataRoot({ value, repoRoot, homeDir }), path.normalize(value));
  assert.equal(fs.existsSync(value), false);
});
