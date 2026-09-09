'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../browser-extension/shared.js');

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    assert.equal(S.escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    assert.equal(S.escapeHtml("a'b"), 'a&#39;b');
    assert.equal(S.escapeHtml(null), '');
  });
});

describe('parseCount / prettyCount', () => {
  it('parses integers, commas, and K/M suffixes', () => {
    assert.equal(S.parseCount('1,234'), 1234);
    assert.equal(S.parseCount('12.3k'), 12300);
    assert.equal(S.parseCount('1.2M'), 1200000);
    assert.equal(S.parseCount(42), 42);
    assert.equal(S.parseCount(''), 0);
    assert.equal(S.parseCount(null), 0);
  });

  it('pretty-prints large numbers', () => {
    assert.equal(S.prettyCount(999), '999');
    assert.equal(S.prettyCount(1200), '1.2K');
    assert.equal(S.prettyCount(15000), '15K');
    assert.equal(S.prettyCount(2500000), '2.5M');
  });

  it('countFromText handles github-style labels', () => {
    assert.equal(S.countFromText('1,234 stars'), '1234');
    assert.equal(S.countFromText('12.3k'), '12300');
  });
});

describe('normalizeLogin', () => {
  it('accepts valid logins and rejects junk', () => {
    assert.equal(S.normalizeLogin('@octocat'), 'octocat');
    assert.equal(S.normalizeLogin('some-user'), 'some-user');
    assert.equal(S.normalizeLogin('-bad'), '');
    assert.equal(S.normalizeLogin('bad-'), '');
    assert.equal(S.normalizeLogin('has space'), '');
    assert.equal(S.normalizeLogin('a'.repeat(40)), '');
  });
});

describe('avatar URL validation', () => {
  it('allows githubusercontent / github https only', () => {
    assert.equal(S.isSafeAvatarUrl('https://avatars.githubusercontent.com/u/1?v=4'), true);
    assert.equal(S.isSafeAvatarUrl('https://github.com/octocat.png'), true);
    assert.equal(S.isSafeAvatarUrl('http://avatars.githubusercontent.com/u/1'), false);
    assert.equal(S.isSafeAvatarUrl('javascript:alert(1)'), false);
    assert.equal(S.isSafeAvatarUrl('https://evil.example/x.png'), false);
    assert.equal(S.isSafeAvatarUrl('data:image/png;base64,aaa'), false);
  });

  it('sanitizeAvatarUrl falls back to github png', () => {
    assert.equal(
      S.sanitizeAvatarUrl('https://evil.example/x.png', 'octocat'),
      'https://github.com/octocat.png?size=40'
    );
    assert.equal(S.sanitizeAvatarUrl('https://avatars.githubusercontent.com/u/1', 'octocat'), 'https://avatars.githubusercontent.com/u/1');
  });
});

describe('calcHealth', () => {
  it('clamps to 0–100 and exposes factors', () => {
    const mega = S.calcHealth({ stars: 500000, forks: 100000, issues: 0, updatedDays: 0 });
    assert.ok(mega.score <= 100);
    assert.ok(mega.score >= 70);
    assert.equal(typeof mega.factors.stars, 'number');
    assert.ok(mega.factors.stars <= 40);
    assert.ok(mega.factors.forks <= 25);
  });

  it('penalizes stale and issue-heavy repos', () => {
    const stale = S.calcHealth({ stars: 100, forks: 20, issues: 500, updatedDays: 400 });
    const fresh = S.calcHealth({ stars: 100, forks: 20, issues: 5, updatedDays: 1 });
    assert.ok(fresh.score > stale.score);
    assert.equal(stale.factors.activity, 0);
    assert.ok(fresh.factors.activity > 0);
  });

  it('handles empty input safely', () => {
    const empty = S.calcHealth({});
    assert.ok(empty.score >= 0 && empty.score <= 100);
  });
});

describe('parseRepoPath', () => {
  it('parses owner/repo and rejects reserved paths', () => {
    assert.deepEqual(S.parseRepoPath('/microsoft/vscode'), { owner: 'microsoft', repo: 'vscode' });
    assert.deepEqual(S.parseRepoPath('/microsoft/vscode/issues'), { owner: 'microsoft', repo: 'vscode' });
    assert.equal(S.parseRepoPath('/settings'), null);
    assert.equal(S.parseRepoPath('/explore'), null);
    assert.equal(S.parseRepoPath('/'), null);
  });
});
