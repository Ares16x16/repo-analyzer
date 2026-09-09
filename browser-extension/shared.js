/**
 * Shared pure helpers for Repo Analyzer (content script, popup, and Node tests).
 * No DOM dependency except where noted.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.RepoAnalyzerShared = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var AVATAR_HOSTS = [
    'avatars.githubusercontent.com',
    'github.com',
    'raw.githubusercontent.com',
    'camo.githubusercontent.com',
    'secure.gravatar.com'
  ];

  function cleanText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeLogin(value) {
    var text = cleanText(value).replace(/^@/, '');
    if (!text) return '';
    // GitHub login: alnum or hyphen, cannot start/end with hyphen, max 39 chars.
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(text)) return '';
    return text;
  }

  /**
   * Parse display counts like "1,234", "12.3k", "1.2M" into integers.
   */
  function parseCount(count) {
    if (count == null || count === '') return 0;
    if (typeof count === 'number' && isFinite(count)) return Math.max(0, Math.round(count));
    var s = String(count).trim().toUpperCase().replace(/,/g, '');
    var short = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*([KM])?$/);
    if (short) {
      var val = parseFloat(short[1]);
      var unit = short[2] || '';
      if (unit === 'K') val *= 1000;
      if (unit === 'M') val *= 1000000;
      return Math.max(0, Math.round(val));
    }
    var digits = s.replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  /**
   * Extract a count from free-form GitHub aria-label / title / text.
   */
  function countFromText(value) {
    var text = cleanText(value).toUpperCase();
    if (!text) return '';
    var exactMatch = text.match(/([0-9][0-9,]*)/);
    var shortMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*([KM])\b/);
    if (shortMatch) {
      return String(parseCount(shortMatch[1] + shortMatch[2]));
    }
    if (exactMatch) return exactMatch[1].replace(/,/g, '');
    return '';
  }

  function prettyCount(v) {
    var n = typeof v === 'number' ? v : parseCount(v);
    if (n >= 1000000) {
      var m = n / 1000000;
      return (m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')) + 'M';
    }
    if (n >= 1000) {
      var k = n / 1000;
      return (k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')) + 'K';
    }
    return String(n);
  }

  /**
   * Only allow https avatar URLs from known GitHub/related hosts.
   */
  function isSafeAvatarUrl(url) {
    if (!url || typeof url !== 'string') return false;
    var trimmed = url.trim();
    if (!trimmed || trimmed.indexOf('javascript:') === 0 || trimmed.indexOf('data:') === 0) {
      return false;
    }
    try {
      var u = new URL(trimmed, 'https://github.com');
      if (u.protocol !== 'https:') return false;
      var host = u.hostname.toLowerCase();
      for (var i = 0; i < AVATAR_HOSTS.length; i++) {
        if (host === AVATAR_HOSTS[i] || host.endsWith('.' + AVATAR_HOSTS[i])) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function sanitizeAvatarUrl(url, login) {
    if (isSafeAvatarUrl(url)) return url.trim();
    var name = normalizeLogin(login);
    if (name) return 'https://github.com/' + name + '.png?size=40';
    return '';
  }

  /**
   * Lightweight health heuristic with per-factor caps (0–100).
   * Uses log scaling so mega-repos do not all collapse to 100 for the same reason.
   */
  function calcHealth(data) {
    var stars = parseCount(data && data.stars);
    var forks = parseCount(data && data.forks);
    var issues = parseCount(data && data.issues);
    var days = Math.max(0, Math.floor(Number((data && data.updatedDays) || 0) || 0));

    function logPoints(n, maxPts, scale) {
      if (n <= 0) return 0;
      return Math.min(maxPts, Math.floor(Math.log10(n + 1) * scale));
    }

    var starPts = logPoints(stars, 40, 12); // ~1k stars ≈ 36, caps at 40
    var forkPts = logPoints(forks, 25, 8); // ~1k forks ≈ 24, caps at 25
    // Fewer open issues → higher score (cap 20). Large backlogs reduce this.
    var issuePts = Math.min(20, Math.max(0, 20 - Math.floor(issues / 25)));
    // Freshness: full 15 if updated within ~2 weeks; decays to 0 after ~30 weeks
    var activityPts = Math.max(0, 15 - Math.min(15, Math.floor(days / 14)));

    var score = starPts + forkPts + issuePts + activityPts;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      score: score,
      factors: {
        stars: starPts,
        forks: forkPts,
        issues: issuePts,
        activity: activityPts,
        updatedDays: days
      }
    };
  }

  function healthColor(health) {
    var h = typeof health === 'object' ? health.score : health;
    if (h >= 70) return '#22c55e';
    if (h >= 40) return '#eab308';
    return '#ef4444';
  }

  /**
   * Detect whether a GitHub pathname looks like a repository route.
   */
  function parseRepoPath(pathname) {
    var path = String(pathname || '');
    var match = path.match(/^\/([^\/]+)\/([^\/]+)(?:\/|$)/);
    if (!match) return null;

    var owner = match[1];
    var repo = match[2];
    var reservedOwners = {
      settings: 1, notifications: 1, marketplace: 1, explore: 1, topics: 1,
      collections: 1, events: 1, sponsors: 1, login: 1, join: 1, logout: 1,
      session: 1, org: 1, organizations: 1, search: 1, pull: 1, pulls: 1,
      issues: 1, codespaces: 1, account: 1, new: 1, about: 1, pricing: 1,
      features: 1, customer: 1, enterprise: 1, security: 1, team: 1,
      site: 1, gist: 1, git: 1
    };
    if (reservedOwners[owner.toLowerCase()]) return null;
    if (owner.indexOf('.') !== -1) return null; // e.g. github.io pages paths are still ok under user/repo
    // Strip .git suffix if present
    repo = repo.replace(/\.git$/i, '');
    if (!repo || repo === '.' || repo === '..') return null;
    // Ignore pure user profile paths handled above; require both segments
    if (!normalizeLogin(owner) && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
      // Orgs can have similar rules; allow alnum/hyphen
      if (!/^[A-Za-z0-9-]+$/.test(owner)) return null;
    }
    return { owner: owner, repo: repo };
  }

  function isLikelyRepoPage(pathname, documentLike) {
    var parsed = parseRepoPath(pathname);
    if (!parsed) return false;
    if (!documentLike) return true;
    try {
      if (documentLike.querySelector('[itemtype*="Repository"], #repository-container-header, meta[name="octolytics-dimension-repository_id"], meta[name="octolytics-dimension-repository_nwo"]')) {
        return true;
      }
      // Soft signal: star / fork counters common on repo pages
      if (documentLike.querySelector('#repo-stars-counter-star, a[href$="/stargazers"], a[href*="/stargazers"]')) {
        return true;
      }
    } catch (e) {
      return true;
    }
    // Path looks like repo but DOM not ready / unusual layout — treat as maybe
    return true;
  }

  return {
    cleanText: cleanText,
    escapeHtml: escapeHtml,
    normalizeLogin: normalizeLogin,
    parseCount: parseCount,
    countFromText: countFromText,
    prettyCount: prettyCount,
    isSafeAvatarUrl: isSafeAvatarUrl,
    sanitizeAvatarUrl: sanitizeAvatarUrl,
    calcHealth: calcHealth,
    healthColor: healthColor,
    parseRepoPath: parseRepoPath,
    isLikelyRepoPage: isLikelyRepoPage,
    AVATAR_HOSTS: AVATAR_HOSTS.slice()
  };
});
