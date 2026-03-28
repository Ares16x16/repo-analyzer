// MV3-safe content script - scrapes GitHub repo data and responds to popup
function scrapeRepoData() {
  var data = { owner: '', repo: '', stars: '0', forks: '0', issues: '0', language: '', license: '', updatedDays: 0, description: '', contributors: [], languages: [] };

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function countFromText(value) {
    var text = cleanText(value).toUpperCase();
    if (!text) return '';
    var exactMatch = text.match(/([0-9][0-9,]*)/);
    if (exactMatch) return exactMatch[1].replace(/,/g, '');
    var shortMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*([KM])/);
    if (!shortMatch) return '';
    var n = parseFloat(shortMatch[1]);
    var unit = shortMatch[2];
    if (unit === 'K') return String(Math.round(n * 1000));
    if (unit === 'M') return String(Math.round(n * 1000000));
    return '';
  }

  function getCountFromElement(el, keyword) {
    if (!el) return '';
    var candidates = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.textContent
    ];
    for (var i = 0; i < candidates.length; i++) {
      var text = cleanText(candidates[i]);
      if (!text) continue;
      if (keyword) {
        var re = new RegExp('([0-9][0-9,]*)\\s+(?:users?\\s+)?' + keyword, 'i');
        var exact = text.match(re);
        if (exact) return exact[1].replace(/,/g, '');
      }
      var parsed = countFromText(text);
      if (parsed) return parsed;
    }
    return '';
  }

  function cleanLicense(value) {
    var text = cleanText(value);
    if (!text) return '';
    if (/create\s+license/i.test(text)) return '';
    if (/add\s+license/i.test(text)) return '';
    return text.substring(0, 60);
  }

  function cleanDescription(value) {
    var text = cleanText(value);
    if (!text) return '';
    if (/contribute to .* development by creating an account on github/i.test(text)) return '';
    return text.substring(0, 180);
  }

  function normalizeLogin(value) {
    var text = cleanText(value).replace(/^@/, '');
    if (!text) return '';
    // GitHub login: alnum or hyphen, cannot start/end with hyphen, max 39 chars.
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(text)) return '';
    return text;
  }

  function cleanLanguageName(value) {
    var text = cleanText(value);
    // GitHub language links can include percentage in the same text node.
    text = text.replace(/\s+[0-9]+(?:\.[0-9]+)?%\s*$/i, '');
    return cleanText(text);
  }
  
  // Get owner/repo from URL
  var pathMatch = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+?)(?:\/|$)/);
  if (!pathMatch) return data;
  data.owner = pathMatch[1];
  data.repo = pathMatch[2];

  // Get page text for fallback
  var pageText = document.body ? document.body.innerText : '';

  // Stars - prefer exact GitHub counter sources
  var starLink =
    document.querySelector('#repo-stars-counter-star') ||
    document.querySelector('a[href$="/stargazers"]') ||
    document.querySelector('a[href*="/stargazers"]');
  var stars = getCountFromElement(starLink, 'starred');
  if (stars) data.stars = stars;
  // Fallback
  if (!data.stars || data.stars === '0') {
    var m = pageText.match(/([0-9,.]+[KM]?)\s*(?:star|watcher)/i);
    if (m) data.stars = countFromText(m[1]) || m[1].replace(/,/g, '');
  }

  // Forks - prefer exact GitHub counter sources
  var forkLink =
    document.querySelector('#repo-network-counter') ||
    document.querySelector('a[href$="/forks"]') ||
    document.querySelector('a[href*="/forks"]');
  var forks = getCountFromElement(forkLink, 'forked');
  if (forks) data.forks = forks;
  if (!data.forks || data.forks === '0') {
    var m = pageText.match(/([0-9,.]+[KM]?)\s*forks?/i);
    if (m) data.forks = countFromText(m[1]) || m[1].replace(/,/g, '');
  }

  // Issues - prefer GitHub tab counters and aria labels
  var issuesEl =
    document.querySelector('#issues-repo-tab-count') ||
    document.querySelector('a#issues-tab') ||
    document.querySelector('a[href$="/issues"] .Counter') ||
    document.querySelector('a[href*="/issues"] .Counter') ||
    document.querySelector('a[href$="/issues"]') ||
    document.querySelector('a[href*="/issues"]');
  var issuesCount = getCountFromElement(issuesEl, 'issue');
  if (issuesCount) data.issues = issuesCount;
  if (!data.issues || data.issues === '0') {
    // Keep fallback narrow so we do not accidentally read PR counters
    var m = pageText.match(/Issues?\s*([0-9][0-9,]*(?:\.[0-9]+)?[KM]?)/i);
    if (m) data.issues = countFromText(m[1]) || m[1].replace(/,/g, '');
  }

  // License
  var licEl =
    document.querySelector('[data-testid="sidebar-license"] a') ||
    document.querySelector('[itemprop="license"]') ||
    document.querySelector('a[href*="/blob/"][href*="/LICENSE"]') ||
    document.querySelector('a[href$="/LICENSE"]');
  data.license = cleanLicense(licEl ? (licEl.getAttribute('aria-label') || licEl.textContent) : '');
  if (!data.license) {
    var metaLic = document.querySelector('meta[property="license"]');
    if (metaLic) data.license = cleanLicense(metaLic.getAttribute('content'));
  }
  if (!data.license) {
    var mLic = pageText.match(/License[s]?[:\s]*([^\n\r]+)/i);
    if (mLic) data.license = cleanLicense(mLic[1]);
  }

  // Updated time
  var timeEl = document.querySelector('relative-time');
  if (timeEl && timeEl.getAttribute('datetime')) {
    var updated = new Date(timeEl.getAttribute('datetime'));
    data.updatedDays = Math.floor((Date.now() - updated.getTime()) / (1000*60*60*24));
  }

  // Description
  var descCandidates = [
    document.querySelector('[data-testid="repo-description"]'),
    document.querySelector('[itemprop="description"]'),
    document.querySelector('.f4.mt-3'),
    document.querySelector('meta[property="og:description"]'),
    document.querySelector('meta[name="description"]')
  ];
  for (var d = 0; d < descCandidates.length && !data.description; d++) {
    var descEl = descCandidates[d];
    if (!descEl) continue;
    var desc = descEl.getAttribute('content') || descEl.textContent;
    data.description = cleanDescription(desc);
  }

  // Contributors - look for GitHub's contributor elements
  var list = [];
  var seenLogins = {};

  function pushContributor(login, avatar) {
    var normalized = normalizeLogin(login);
    if (!normalized) return;
    var key = normalized.toLowerCase();
    if (seenLogins[key]) return;
    seenLogins[key] = true;
    list.push({ login: normalized, avatar: avatar || '' });
  }
  
  // Try different selectors for contributors
  var contributorSelectors = [
    // Most reliable on repo page: contributor links themselves
    'a[data-hovercard-type="user"]',
    'a[data-hovercard-type="user"] img[alt^="@"]',
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
      var login = img ? cleanText(img.getAttribute('alt')).replace(/^@/, '') : '';
      if (!login && linkEl) {
        var href = linkEl.getAttribute('href');
        if (/^\/[A-Za-z0-9-]+$/.test(href)) login = href.replace(/^\//, '');
      }
      pushContributor(login, img ? img.src : '');
    }
  }
  
  // Additional fallback: look for any image in user-related links
  if (list.length < 3) {
    var allLinks = document.querySelectorAll('a[href^="/"]');
    for (var j = 0; j < allLinks.length && list.length < 12; j++) {
      var link = allLinks[j];
      var href = link.getAttribute('href');
      if (href && href.match(/^\/[a-zA-Z0-9-]+$/) && href !== '/' && href.length > 1) {
        var img = link.querySelector('img');
        if (img) {
          pushContributor(href.replace(/^\//, ''), img.src);
        }
      }
    }
  }
  
  data.contributors = list;

  // Languages distribution
  var langPcts = {};
  var langLinks = document.querySelectorAll('a[href*="/search?l="]');
  for (var k = 0; k < langLinks.length; k++) {
    var langName = cleanLanguageName(langLinks[k].textContent);
    if (!langName || langName.length > 25) continue;
    var containerText = cleanText(langLinks[k].closest('li, a, span, div') ? langLinks[k].closest('li, a, span, div').textContent : '');
    var pctMatch = containerText.match(/([0-9]+(?:\.[0-9]+)?)%/);
    if (pctMatch) {
      langPcts[langName] = parseFloat(pctMatch[1]);
    }
  }

  if (Object.keys(langPcts).length === 0) {
    var globalLangMatch;
    var globalLangRegex = /([A-Za-z][A-Za-z0-9#+.\- ]{0,24})\s+([0-9]+(?:\.[0-9]+)?)%/g;
    while ((globalLangMatch = globalLangRegex.exec(pageText)) !== null) {
      var n = cleanText(globalLangMatch[1]);
      var p = parseFloat(globalLangMatch[2]);
      if (p > 100 || n.length < 2) continue;
      if (/^(health|issues|pull requests?|commits?)$/i.test(n)) continue;
      if (!langPcts[n] || p > langPcts[n]) {
        langPcts[n] = p;
      }
    }
  }
  
  if (Object.keys(langPcts).length > 0) {
    var colorMap = {
      "TypeScript":"#3178c6","JavaScript":"#f7df1e","Python":"#3572A5","Java":"#b07219","Go":"#00ADD8","Rust":"#dea584","C++":"#f34b7d","C#":"#5C2D91","Ruby":"#701516","PHP":"#4F5D95","HTML":"#e34c26","CSS":"#563d7c"
    };
    var langsData = [];
    for (var lang in langPcts) {
      langsData.push({ name: lang, pct: langPcts[lang], color: colorMap[lang] || '#6b7280' });
    }
    langsData.sort(function(a, b) { return b.pct - a.pct; });
    data.languages = langsData.slice(0, 5);
    if (!data.language && data.languages.length > 0) data.language = data.languages[0].name;
  }

  return data;
}

function enrichContributors(data) {
  if (!data || !data.owner || !data.repo) return Promise.resolve(data);
  if (Array.isArray(data.contributors) && data.contributors.length >= 10) return Promise.resolve(data);

  var existing = {};
  for (var i = 0; i < data.contributors.length; i++) {
    var login = String(data.contributors[i].login || '').trim().toLowerCase();
    if (login) existing[login] = true;
  }

  function normalizeLogin(value) {
    var text = String(value || '').replace(/^@/, '').trim();
    if (!text) return '';
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(text)) return '';
    return text;
  }

  function addContributor(login, avatar) {
    var name = normalizeLogin(login);
    if (!name) return;
    var key = name.toLowerCase();
    if (existing[key]) return;
    existing[key] = true;
    data.contributors.push({
      login: name,
      avatar: avatar || ('https://github.com/' + name + '.png?size=40')
    });
  }

  var url = 'https://github.com/' + data.owner + '/' + data.repo + '/contributors';
  return fetch(url, { credentials: 'include' })
    .then(function(resp) {
      if (!resp.ok) throw new Error('contributors fetch failed');
      return resp.text();
    })
    .then(function(html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var main = doc.querySelector('main') || doc;

      // Primary: avatar images with @login alt text in page main content.
      var avatars = main.querySelectorAll('img[alt^="@"]');
      for (var a = 0; a < avatars.length && data.contributors.length < 12; a++) {
        var alt = (avatars[a].getAttribute('alt') || '').replace(/^@/, '').trim();
        var link = avatars[a].closest('a[href^="/"]');
        var href = link ? (link.getAttribute('href') || '') : '';
        if (!alt && /^\/[A-Za-z0-9-]+$/.test(href)) alt = href.slice(1);
        if (alt) addContributor(alt, avatars[a].getAttribute('src') || '');
      }

      // Secondary: direct user links (still constrained to main content).
      var userLinks = main.querySelectorAll('a[data-hovercard-type="user"][href^="/"]');
      for (var u = 0; u < userLinks.length && data.contributors.length < 12; u++) {
        var userHref = userLinks[u].getAttribute('href') || '';
        if (/^\/[A-Za-z0-9-]+$/.test(userHref)) {
          addContributor(userHref.slice(1), '');
        }
      }
      return data;
    })
    .catch(function() {
      return data;
    });
}

chrome.runtime.onMessage.addListener(function(req, sender, sendResponse) {
  if (req.action === 'getData') {
    var data = scrapeRepoData();
    enrichContributors(data).then(function(finalData) {
      sendResponse({ data: finalData });
    });
    return true;
  }
  return false;
});
