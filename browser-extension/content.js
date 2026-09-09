// MV3 content script — scrapes GitHub repo pages and responds to the popup.
(function () {
  'use strict';

  var S = globalThis.RepoAnalyzerShared;
  if (!S) {
    console.error('[Repo Analyzer] shared.js missing');
    return;
  }

  function getCountFromElement(el, keyword) {
    if (!el) return '';
    var candidates = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.textContent
    ];
    for (var i = 0; i < candidates.length; i++) {
      var text = S.cleanText(candidates[i]);
      if (!text) continue;
      if (keyword) {
        var re = new RegExp('([0-9][0-9,]*(?:\\.[0-9]+)?[KM]?)\\s+(?:users?\\s+)?' + keyword, 'i');
        var exact = text.match(re);
        if (exact) {
          var parsed = S.countFromText(exact[1]);
          if (parsed) return parsed;
          return exact[1].replace(/,/g, '').replace(/[KM]$/i, function (u) {
            return u;
          });
        }
      }
      var fromText = S.countFromText(text);
      if (fromText) return fromText;
    }
    return '';
  }

  function cleanLicense(value) {
    var text = S.cleanText(value);
    if (!text) return '';
    if (/create\s+license/i.test(text)) return '';
    if (/add\s+(a\s+)?license/i.test(text)) return '';
    if (/no\s+license/i.test(text)) return '';
    return text.substring(0, 60);
  }

  function cleanDescription(value) {
    var text = S.cleanText(value);
    if (!text) return '';
    if (/contribute to .* development by creating an account on github/i.test(text)) return '';
    if (/^github$/i.test(text)) return '';
    return text.substring(0, 180);
  }

  function cleanLanguageName(value) {
    var text = S.cleanText(value);
    text = text.replace(/\s+[0-9]+(?:\.[0-9]+)?%\s*$/i, '');
    return S.cleanText(text);
  }

  function emptyData(extra) {
    var base = {
      owner: '',
      repo: '',
      stars: '0',
      forks: '0',
      issues: '0',
      language: '',
      license: '',
      updatedDays: 0,
      description: '',
      contributors: [],
      languages: [],
      isRepoPage: false,
      error: null
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k];
      }
    }
    return base;
  }

  function scrapeRepoData() {
    var parsed = S.parseRepoPath(window.location.pathname);
    if (!parsed) {
      return emptyData({
        error: 'not_a_repo',
        message: 'Open a GitHub repository page (github.com/owner/repo).'
      });
    }

    var data = emptyData({
      owner: parsed.owner,
      repo: parsed.repo,
      isRepoPage: true
    });

    var pageText = document.body ? document.body.innerText : '';

    // Soft DOM check — still attempt scrape if path looks like a repo
    var hasRepoChrome = !!(
      document.querySelector('#repository-container-header') ||
      document.querySelector('meta[name="octolytics-dimension-repository_id"]') ||
      document.querySelector('meta[name="octolytics-dimension-repository_nwo"]') ||
      document.querySelector('#repo-stars-counter-star') ||
      document.querySelector('a[href$="/stargazers"]')
    );
    if (!hasRepoChrome) {
      // Could be a user profile that happens to match /owner/something, or spa mid-nav
      var about = document.querySelector('meta[name="description"]');
      var og = document.querySelector('meta[property="og:type"]');
      var ogType = og ? og.getAttribute('content') : '';
      if (ogType && ogType.indexOf('profile') !== -1) {
        return emptyData({
          owner: parsed.owner,
          repo: parsed.repo,
          error: 'not_a_repo',
          message: 'This looks like a user/org profile, not a repository.'
        });
      }
    }

    // Stars
    var starLink =
      document.querySelector('#repo-stars-counter-star') ||
      document.querySelector('a[href$="/stargazers"]') ||
      document.querySelector('a[href*="/stargazers"]') ||
      document.querySelector('#repo-stars-counter-unstar');
    var stars = getCountFromElement(starLink, 'starred');
    if (!stars) stars = getCountFromElement(starLink, 'star');
    if (stars) data.stars = String(S.parseCount(stars));
    if (!data.stars || data.stars === '0') {
      var mStar = pageText.match(/([0-9,.]+[KM]?)\s*(?:stars?|watchers?)/i);
      if (mStar) data.stars = String(S.parseCount(mStar[1]));
    }

    // Forks
    var forkLink =
      document.querySelector('#repo-network-counter') ||
      document.querySelector('a[href$="/forks"]') ||
      document.querySelector('a[href*="/network/members"]') ||
      document.querySelector('a[href*="/forks"]');
    var forks = getCountFromElement(forkLink, 'forked');
    if (!forks) forks = getCountFromElement(forkLink, 'fork');
    if (forks) data.forks = String(S.parseCount(forks));
    if (!data.forks || data.forks === '0') {
      var mFork = pageText.match(/([0-9,.]+[KM]?)\s*forks?/i);
      if (mFork) data.forks = String(S.parseCount(mFork[1]));
    }

    // Issues — avoid PR counters
    var issuesEl =
      document.querySelector('#issues-repo-tab-count') ||
      document.querySelector('a#issues-tab .Counter') ||
      document.querySelector('a#issues-tab') ||
      document.querySelector('a[data-selected-links~="repo_issues"] .Counter') ||
      document.querySelector('a[href$="/issues"] .Counter') ||
      document.querySelector('a[href*="/issues"] .Counter');
    var issuesCount = getCountFromElement(issuesEl, 'issue');
    if (issuesCount) data.issues = String(S.parseCount(issuesCount));
    if (!data.issues || data.issues === '0') {
      var mIss = pageText.match(/\bIssues?\s*([0-9][0-9,]*(?:\.[0-9]+)?[KM]?)/i);
      if (mIss) data.issues = String(S.parseCount(mIss[1]));
    }

    // License
    var licEl =
      document.querySelector('[data-testid="sidebar-license"] a') ||
      document.querySelector('[itemprop="license"]') ||
      document.querySelector('a[href*="/blob/"][href*="/LICENSE"]') ||
      document.querySelector('a[href$="/LICENSE"]') ||
      document.querySelector('#repo-content-pjax-container a[href*="LICENSE"]');
    data.license = cleanLicense(licEl ? (licEl.getAttribute('aria-label') || licEl.textContent) : '');
    if (!data.license) {
      var metaLic = document.querySelector('meta[property="license"]');
      if (metaLic) data.license = cleanLicense(metaLic.getAttribute('content'));
    }
    if (!data.license) {
      var aboutRows = document.querySelectorAll('.BorderGrid-cell, .Layout-sidebar li, [data-testid="sidebar-license"]');
      for (var li = 0; li < aboutRows.length && !data.license; li++) {
        var rowText = S.cleanText(aboutRows[li].textContent);
        if (/^License\b/i.test(rowText) || /\bMIT\b|\bApache\b|\bGPL\b/i.test(rowText)) {
          var licMatch = rowText.match(/License\s*(.+)$/i) || rowText.match(/\b(MIT|Apache(?:\s+2\.0)?|GPL(?:-?[0-9.]+)?|BSD(?:-[0-9]-Clause)?|ISC|Unlicense|MPL(?:-?[0-9.]+)?)\b/i);
          if (licMatch) data.license = cleanLicense(licMatch[1]);
        }
      }
    }

    // Updated time — prefer latest commit relative-time in the repo
    var timeEl =
      document.querySelector('relative-time[datetime]') ||
      document.querySelector('time-ago[datetime]') ||
      document.querySelector('time[datetime]');
    if (timeEl && timeEl.getAttribute('datetime')) {
      var updated = new Date(timeEl.getAttribute('datetime'));
      if (!isNaN(updated.getTime())) {
        data.updatedDays = Math.max(0, Math.floor((Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }

    // Description
    var descCandidates = [
      document.querySelector('[data-testid="repo-description"]'),
      document.querySelector('[itemprop="description"]'),
      document.querySelector('.f4.my-3'),
      document.querySelector('.f4.mt-3'),
      document.querySelector('p.f4'),
      document.querySelector('meta[property="og:description"]'),
      document.querySelector('meta[name="description"]')
    ];
    for (var d = 0; d < descCandidates.length && !data.description; d++) {
      var descEl = descCandidates[d];
      if (!descEl) continue;
      var desc = descEl.getAttribute('content') || descEl.textContent;
      data.description = cleanDescription(desc);
    }

    // Contributors
    var list = [];
    var seenLogins = {};

    function pushContributor(login, avatar) {
      var normalized = S.normalizeLogin(login);
      if (!normalized) return;
      var key = normalized.toLowerCase();
      if (seenLogins[key]) return;
      // Skip the repo owner org/bot noise lightly — still allow owner as contributor
      seenLogins[key] = true;
      list.push({
        login: normalized,
        avatar: S.sanitizeAvatarUrl(avatar, normalized)
      });
    }

    var contributorSelectors = [
      '#repository-container-header a[data-hovercard-type="user"]',
      '.Layout-sidebar a[data-hovercard-type="user"]',
      'a[data-hovercard-type="user"]',
      '.AvatarStack--three-plus img[alt^="@"]',
      '.AvatarStack img[alt^="@"]',
      'a[href^="/"] img.avatar[alt^="@"]',
      '.contributors img[alt^="@"]'
    ];

    for (var s = 0; s < contributorSelectors.length && list.length < 12; s++) {
      var elements = document.querySelectorAll(contributorSelectors[s]);
      for (var i = 0; i < elements.length && list.length < 12; i++) {
        var el = elements[i];
        var img = el.tagName === 'IMG' ? el : el.querySelector('img[alt^="@"]');
        var linkEl = el.tagName === 'A' ? el : (img ? img.closest('a[href^="/"]') : null);
        var login = img ? S.cleanText(img.getAttribute('alt')).replace(/^@/, '') : '';
        if (!login && linkEl) {
          var href = linkEl.getAttribute('href') || '';
          if (/^\/[A-Za-z0-9-]+$/.test(href)) login = href.replace(/^\//, '');
        }
        pushContributor(login, img ? (img.getAttribute('src') || img.src || '') : '');
      }
    }

    // Narrow fallback: only avatar images with @alt inside sidebar-ish containers
    if (list.length < 3) {
      var side = document.querySelector('.Layout-sidebar') || document.querySelector('#repository-container-header') || document;
      var imgs = side.querySelectorAll('img[alt^="@"]');
      for (var j = 0; j < imgs.length && list.length < 12; j++) {
        var im = imgs[j];
        pushContributor(S.cleanText(im.getAttribute('alt')).replace(/^@/, ''), im.getAttribute('src') || im.src || '');
      }
    }

    data.contributors = list;

    // Languages
    var langPcts = {};
    var langLinks = document.querySelectorAll(
      'a[href*="/search?l="], a[href*="/search?" ][href*="l="], span[itemprop="programmingLanguage"]'
    );
    for (var k = 0; k < langLinks.length; k++) {
      var langName = cleanLanguageName(langLinks[k].textContent);
      if (!langName || langName.length > 25) continue;
      var closest = langLinks[k].closest('li, a, span, div');
      var containerText = S.cleanText(closest ? closest.textContent : langLinks[k].textContent);
      var pctMatch = containerText.match(/([0-9]+(?:\.[0-9]+)?)%/);
      if (pctMatch) {
        langPcts[langName] = parseFloat(pctMatch[1]);
      } else if (!(langName in langPcts)) {
        // Language name without pct (itemprop)
        langPcts[langName] = langPcts[langName] || 0;
      }
    }

    // BorderGrid language bar (new GitHub layout)
    var langBorder = document.querySelectorAll('.BorderGrid-row .Progress-item, [aria-label*="%"]');
    for (var b = 0; b < langBorder.length; b++) {
      var aria = langBorder[b].getAttribute('aria-label') || '';
      var am = aria.match(/^(.+?)\s+([0-9]+(?:\.[0-9]+)?)%/);
      if (am) {
        var bn = cleanLanguageName(am[1]);
        if (bn && bn.length <= 25) langPcts[bn] = parseFloat(am[2]);
      }
    }

    if (Object.keys(langPcts).length === 0) {
      var globalLangMatch;
      var globalLangRegex = /([A-Za-z][A-Za-z0-9#+.\- ]{0,24})\s+([0-9]+(?:\.[0-9]+)?)%/g;
      while ((globalLangMatch = globalLangRegex.exec(pageText)) !== null) {
        var n = S.cleanText(globalLangMatch[1]);
        var p = parseFloat(globalLangMatch[2]);
        if (p > 100 || n.length < 2) continue;
        if (/^(health|issues|pull requests?|commits?|files?|stars?|forks?)$/i.test(n)) continue;
        if (!langPcts[n] || p > langPcts[n]) langPcts[n] = p;
      }
    }

    if (Object.keys(langPcts).length > 0) {
      var colorMap = {
        TypeScript: '#3178c6',
        JavaScript: '#f7df1e',
        Python: '#3572A5',
        Java: '#b07219',
        Go: '#00ADD8',
        Rust: '#dea584',
        'C++': '#f34b7d',
        'C#': '#5C2D91',
        Ruby: '#701516',
        PHP: '#4F5D95',
        HTML: '#e34c26',
        CSS: '#563d7c',
        Shell: '#89e051',
        C: '#555555',
        Kotlin: '#A97BFF',
        Swift: '#F05138',
        Dart: '#00B4AB',
        Vue: '#41b883',
        Scala: '#c22d40'
      };
      var langsData = [];
      for (var lang in langPcts) {
        if (!Object.prototype.hasOwnProperty.call(langPcts, lang)) continue;
        var pct = Number(langPcts[lang]) || 0;
        if (pct < 0 || pct > 100) continue;
        langsData.push({
          name: lang,
          pct: pct,
          color: colorMap[lang] || '#6b7280'
        });
      }
      langsData.sort(function (a, b) { return b.pct - a.pct; });
      // If we only have names with 0%, keep top names without fake bars
      data.languages = langsData.slice(0, 5);
      if (!data.language && data.languages.length > 0) data.language = data.languages[0].name;
    }

    return data;
  }

  function enrichContributors(data) {
    if (!data || data.error || !data.owner || !data.repo) return Promise.resolve(data);
    if (Array.isArray(data.contributors) && data.contributors.length >= 10) {
      return Promise.resolve(data);
    }

    var existing = {};
    for (var i = 0; i < (data.contributors || []).length; i++) {
      var login = String(data.contributors[i].login || '').trim().toLowerCase();
      if (login) existing[login] = true;
    }

    function addContributor(login, avatar) {
      var name = S.normalizeLogin(login);
      if (!name) return;
      var key = name.toLowerCase();
      if (existing[key]) return;
      existing[key] = true;
      data.contributors.push({
        login: name,
        avatar: S.sanitizeAvatarUrl(avatar, name)
      });
    }

    var url = 'https://github.com/' + encodeURIComponent(data.owner) + '/' + encodeURIComponent(data.repo) + '/contributors';
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, 4000);
    }

    return fetch(url, {
      credentials: 'same-origin',
      signal: controller ? controller.signal : undefined,
      headers: { Accept: 'text/html' }
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error('contributors fetch failed');
        return resp.text();
      })
      .then(function (html) {
        // Bound size — avoid parsing huge error pages
        if (html.length > 1500000) html = html.slice(0, 1500000);
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var main = doc.querySelector('main') || doc.querySelector('#repo-content-pjax-container') || doc;

        var avatars = main.querySelectorAll('img[alt^="@"]');
        for (var a = 0; a < avatars.length && data.contributors.length < 12; a++) {
          var alt = (avatars[a].getAttribute('alt') || '').replace(/^@/, '').trim();
          var link = avatars[a].closest('a[href^="/"]');
          var href = link ? (link.getAttribute('href') || '') : '';
          if (!alt && /^\/[A-Za-z0-9-]+$/.test(href)) alt = href.slice(1);
          if (alt) addContributor(alt, avatars[a].getAttribute('src') || '');
        }

        var userLinks = main.querySelectorAll('a[data-hovercard-type="user"][href^="/"]');
        for (var u = 0; u < userLinks.length && data.contributors.length < 12; u++) {
          var userHref = userLinks[u].getAttribute('href') || '';
          if (/^\/[A-Za-z0-9-]+$/.test(userHref)) addContributor(userHref.slice(1), '');
        }
        return data;
      })
      .catch(function () {
        return data;
      })
      .then(function (result) {
        if (timer) clearTimeout(timer);
        return result;
      });
  }

  function handleGetData(sendResponse) {
    try {
      var data = scrapeRepoData();
      enrichContributors(data).then(function (finalData) {
        sendResponse({ ok: !finalData.error, data: finalData });
      });
    } catch (err) {
      sendResponse({
        ok: false,
        data: emptyData({
          error: 'scrape_failed',
          message: 'Could not read this page. Try reloading.'
        })
      });
    }
  }

  chrome.runtime.onMessage.addListener(function (req, sender, sendResponse) {
    if (req && req.action === 'getData') {
      handleGetData(sendResponse);
      return true; // async
    }
    if (req && req.action === 'ping') {
      sendResponse({ ok: true, version: '5.0.0' });
      return false;
    }
    return false;
  });
})();
