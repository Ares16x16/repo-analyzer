// Popup — messaging + safe DOM rendering (no untrusted innerHTML).
(function () {
  'use strict';

  var S = globalThis.RepoAnalyzerShared;
  if (!S) {
    document.addEventListener('DOMContentLoaded', function () {
      showError('Extension helpers failed to load. Reinstall/reload the extension.');
    });
    return;
  }

  var lastData = null;

  function $(id) {
    return document.getElementById(id);
  }

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== '') node.textContent = text;
    return node;
  }

  function showLoading(msg) {
    var content = $('content');
    clearNode(content);
    var wrap = el('div', 'loading');
    var spinner = el('div', 'spinner');
    spinner.setAttribute('aria-hidden', 'true');
    wrap.appendChild(spinner);
    wrap.appendChild(el('div', 'loading-text', msg || 'Analyzing repository…'));
    content.appendChild(wrap);
    $('actions').hidden = true;
  }

  function showError(msg, hint) {
    var content = $('content');
    clearNode(content);
    var box = el('div', 'error');
    box.appendChild(el('div', 'error-title', 'Cannot analyze'));
    box.appendChild(el('div', 'error-msg', msg || 'Unknown error'));
    if (hint) box.appendChild(el('div', 'error-hint', hint));
    content.appendChild(box);
    $('actions').hidden = true;
    lastData = null;
  }

  function showEmpty(title, detail) {
    var content = $('content');
    clearNode(content);
    var box = el('div', 'empty');
    box.appendChild(el('div', 'empty-title', title));
    if (detail) box.appendChild(el('div', 'empty-detail', detail));
    content.appendChild(box);
  }

  function factorLabel(key) {
    if (key === 'stars') return 'Stars';
    if (key === 'forks') return 'Forks';
    if (key === 'issues') return 'Issue load';
    if (key === 'activity') return 'Freshness';
    return key;
  }

  function render(data) {
    lastData = data;
    var content = $('content');
    clearNode(content);

    if (data.error === 'not_a_repo') {
      showError(
        data.message || 'Not a repository page.',
        'Navigate to https://github.com/owner/repo and open the popup again.'
      );
      return;
    }

    var health = S.calcHealth(data);
    var color = S.healthColor(health);

    var name = el('div', 'repo-name');
    name.textContent = (data.owner || '?') + '/' + (data.repo || '?');
    content.appendChild(name);

    if (data.description) {
      content.appendChild(el('div', 'repo-desc', data.description));
    } else {
      content.appendChild(el('div', 'repo-desc muted', 'No description'));
    }

    var grid = el('div', 'stats-grid');
    function addStat(label, value) {
      var card = el('div', 'stat-card');
      card.appendChild(el('div', 'stat-value', S.prettyCount(value)));
      card.appendChild(el('div', 'stat-label', label));
      grid.appendChild(card);
    }
    addStat('Stars', data.stars);
    addStat('Forks', data.forks);
    addStat('Issues', data.issues);
    content.appendChild(grid);

    var info = el('div', 'info-row');
    info.appendChild(el('span', null, 'License: ' + (data.license || 'N/A')));
    if (data.language) {
      info.appendChild(el('span', null, 'Primary: ' + data.language));
    }
    content.appendChild(info);

    // Health
    var healthSection = el('div', 'section');
    var healthLabel = el('div', 'health-label');
    healthLabel.appendChild(el('span', null, 'Health score'));
    var healthVal = el('span', 'health-value', String(health.score));
    healthVal.style.color = color;
    healthLabel.appendChild(healthVal);
    healthSection.appendChild(healthLabel);

    var bar = el('div', 'health-bar');
    var fill = el('div', 'health-fill');
    fill.style.width = health.score + '%';
    fill.style.background = color;
    bar.appendChild(fill);
    healthSection.appendChild(bar);

    var factors = el('div', 'health-factors');
    var order = ['stars', 'forks', 'issues', 'activity'];
    for (var f = 0; f < order.length; f++) {
      var key = order[f];
      var pts = health.factors[key];
      var chip = el('span', 'factor-chip', factorLabel(key) + ' ' + pts);
      factors.appendChild(chip);
    }
    if (health.factors.updatedDays != null) {
      var days = health.factors.updatedDays;
      var dayText = days === 0 ? 'Updated today' : ('Updated ~' + days + 'd ago');
      factors.appendChild(el('span', 'factor-chip muted', dayText));
    }
    healthSection.appendChild(factors);
    content.appendChild(healthSection);

    // Languages
    var langs = Array.isArray(data.languages) ? data.languages : [];
    var langSection = el('div', 'section');
    langSection.appendChild(el('div', 'section-title', 'Languages'));
    if (langs.length === 0) {
      langSection.appendChild(el('div', 'empty-inline', 'No language breakdown found on this page.'));
    } else {
      for (var j = 0; j < langs.length; j++) {
        var l = langs[j];
        var row = el('div', 'lang-bar');
        row.appendChild(el('span', 'lang-name', l.name || 'Unknown'));
        var pct = typeof l.pct === 'number' ? l.pct : 0;
        row.appendChild(el('span', 'lang-pct', pct > 0 ? pct.toFixed(1) + '%' : '—'));
        var bc = el('div', 'bar-container');
        var bf = el('div', 'bar-fill');
        var width = Math.max(0, Math.min(100, pct));
        bf.style.width = width + '%';
        var bg = typeof l.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(l.color) ? l.color : '#6b7280';
        bf.style.background = bg;
        bc.appendChild(bf);
        row.appendChild(bc);
        langSection.appendChild(row);
      }
    }
    content.appendChild(langSection);

    // Contributors
    var contribSection = el('div', 'section');
    contribSection.appendChild(el('div', 'section-title', 'Contributors'));
    var contribWrap = el('div', 'contributors');
    var contribs = Array.isArray(data.contributors) ? data.contributors.slice(0, 10) : [];
    if (contribs.length === 0) {
      contribWrap.appendChild(el('div', 'empty-inline', 'No contributors found on this page.'));
    } else {
      for (var i = 0; i < contribs.length; i++) {
        var c = contribs[i];
        var login = S.normalizeLogin(c.login);
        if (!login) continue;
        var chip = el('div', 'contributor');
        var avatarUrl = S.sanitizeAvatarUrl(c.avatar, login);
        if (avatarUrl) {
          var img = document.createElement('img');
          img.alt = '';
          img.width = 16;
          img.height = 16;
          img.referrerPolicy = 'no-referrer';
          img.src = avatarUrl;
          img.addEventListener('error', function () {
            this.style.display = 'none';
          });
          chip.appendChild(img);
        }
        chip.appendChild(document.createTextNode(login));
        contribWrap.appendChild(chip);
      }
    }
    contribSection.appendChild(contribWrap);
    content.appendChild(contribSection);

    $('actions').hidden = false;
    $('openBtn').onclick = function () {
      var url = 'https://github.com/' + encodeURIComponent(data.owner) + '/' + encodeURIComponent(data.repo);
      window.open(url, '_blank', 'noopener,noreferrer');
    };
  }

  function exportJson() {
    if (!lastData) return;
    var health = S.calcHealth(lastData);
    var payload = {
      exportedAt: new Date().toISOString(),
      extension: 'Repo Analyzer',
      version: '5.0.0',
      repository: {
        owner: lastData.owner,
        repo: lastData.repo,
        url: 'https://github.com/' + lastData.owner + '/' + lastData.repo
      },
      description: lastData.description || '',
      stars: S.parseCount(lastData.stars),
      forks: S.parseCount(lastData.forks),
      issues: S.parseCount(lastData.issues),
      license: lastData.license || null,
      language: lastData.language || null,
      languages: lastData.languages || [],
      updatedDays: lastData.updatedDays || 0,
      health: health,
      contributors: (lastData.contributors || []).map(function (c) {
        return { login: c.login, avatar: S.sanitizeAvatarUrl(c.avatar, c.login) };
      })
    };
    var text = JSON.stringify(payload, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        flashCopy('Copied JSON');
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      flashCopy('Copied JSON');
    } catch (e) {
      flashCopy('Copy failed');
    }
    document.body.removeChild(ta);
  }

  function flashCopy(msg) {
    var btn = $('copyBtn');
    if (!btn) return;
    var prev = btn.textContent;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(function () {
      btn.textContent = prev;
      btn.disabled = false;
    }, 1200);
  }

  function tabLooksLikeGithubRepo(tab) {
    if (!tab || !tab.url) return { ok: false, reason: 'no_tab' };
    var url;
    try {
      url = new URL(tab.url);
    } catch (e) {
      return { ok: false, reason: 'bad_url' };
    }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
      return { ok: false, reason: 'not_github' };
    }
    var parsed = S.parseRepoPath(url.pathname);
    if (!parsed) return { ok: false, reason: 'not_repo', url: url };
    return { ok: true, owner: parsed.owner, repo: parsed.repo, url: url };
  }

  function requestData(tabId) {
    return new Promise(function (resolve, reject) {
      chrome.tabs.sendMessage(tabId, { action: 'getData' }, function (res) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res || !res.data) {
          reject(new Error('empty response'));
          return;
        }
        resolve(res);
      });
    });
  }

  function injectContentScripts(tabId) {
    if (!chrome.scripting || !chrome.scripting.executeScript) {
      return Promise.reject(new Error('scripting unavailable'));
    }
    return chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['shared.js', 'content.js']
    });
  }

  function init() {
    showLoading('Analyzing repository…');
    $('copyBtn').onclick = exportJson;

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      var check = tabLooksLikeGithubRepo(tab);
      if (!check.ok) {
        if (check.reason === 'not_github') {
          showError(
            'Open a GitHub repository page first.',
            'This extension reads the current tab — no API key required.'
          );
        } else if (check.reason === 'not_repo') {
          showError(
            'This GitHub page is not a repository.',
            'Try a URL like https://github.com/owner/repo'
          );
        } else {
          showError('No active tab found.', 'Open a GitHub repo and try again.');
        }
        return;
      }

      requestData(tab.id)
        .catch(function () {
          // Content script may be missing after SPA / soft nav / fresh install
          return injectContentScripts(tab.id).then(function () {
            return requestData(tab.id);
          });
        })
        .then(function (res) {
          render(res.data);
        })
        .catch(function () {
          showError(
            'Could not reach the page script.',
            'Reload the GitHub tab, then open Repo Analyzer again.'
          );
        });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
