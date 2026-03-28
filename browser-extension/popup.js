// Popup script - fetches data via MV3 messaging and renders a compact UI
(function() {
  function prettyCount(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') {
      if (v >= 1000000) return (v/1000000).toFixed(1) + 'M';
      if (v >= 1000) return (v/1000).toFixed(1) + 'K';
      return String(v);
    }
    return '0';
  }

  function healthColor(health) {
    if (health >= 70) return '#22c55e';
    if (health >= 40) return '#eab308';
    return '#ef4444';
  }

  function parseDisplayCount(count) {
    if (count == null) return 0;
    if (typeof count === 'number') return count;
    var s = String(count).trim();
    var m = s.match(/^([0-9]+(?:\.[0-9]+)?)([KM]?)/i);
    if (m) {
      var val = parseFloat(m[1]);
      var unit = (m[2] || '').toUpperCase();
      if (unit === 'K') val = val * 1000;
      if (unit === 'M') val = val * 1000000;
      return Math.round(val);
    }
    var digits = s.replace(/[^0-9]/g, '');
    return digits ? parseInt(digits) : 0;
  }

  function calcHealth(data) {
    var s = parseDisplayCount(data.stars);
    var f = parseDisplayCount(data.forks);
    var i = parseDisplayCount(data.issues);
    var days = data.updatedDays || 0;
    var score = Math.min(100, Math.floor(s/50) + Math.floor(f/20) + Math.max(0, 50 - i) / 5);
    score -= Math.min(30, Math.floor(days/7));
    return Math.max(0, Math.min(100, score));
  }

  function render(data) {
    var health = calcHealth(data);
    var color = healthColor(health);
    var stars = prettyCount(data.stars);
    var forks = prettyCount(data.forks);
    var issues = prettyCount(data.issues);
    
    var contribHtml = '';
    if (data.contributors && data.contributors.length > 0) {
      var contribs = data.contributors.slice(0, 10);
      var contribArr = [];
      for (var i = 0; i < contribs.length; i++) {
        contribArr.push('<div class="contributor"><img src="' + contribs[i].avatar + '">' + contribs[i].login + '</div>');
      }
      contribHtml = contribArr.join('');
    } else {
      contribHtml = '<div style="color:#9ca3af;font-size:0.75em">No contributors found</div>';
    }
    
    // Languages block
    var langsBlock = '';
    if (Array.isArray(data.languages) && data.languages.length > 0) {
      langsBlock = '<div class="section"><div class="section-title">Languages</div>';
      for (var j = 0; j < data.languages.length; j++) {
        var l = data.languages[j];
        var pct = l.pct ? l.pct.toFixed(1) : '0';
        langsBlock += '<div class="lang-bar"><span class="lang-name" style="width:90px;display:inline-block;">' + l.name + '</span><span class="lang-pct">' + pct + '%</span><div class="bar-container"><div class="bar-fill" style="width:' + pct + '%;background:' + l.color + '"></div></div></div>';
      }
      langsBlock += '</div>';
    }
    
    var descHtml = data.description ? '<div class="repo-desc">' + data.description + '</div>' : '';
    
    var html = 
      '<div class="repo-name">' + (data.owner || '') + '/' + (data.repo || '') + '</div>' +
      descHtml +
      '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-value">' + stars + '</div><div class="stat-label">Stars</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + forks + '</div><div class="stat-label">Forks</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + issues + '</div><div class="stat-label">Issues</div></div>' +
      '</div>' +
      '<div class="info-row"><span>License: ' + (data.license || 'N/A') + '</span></div>' +
      '<div class="health-label"><span>Health</span><span style="color:' + color + '">' + health + '%</span></div>' +
      '<div class="health-bar"><div class="health-fill" style="width:' + health + '%;background:' + color + '"></div></div>' +
      langsBlock +
      '<div class="section"><div class="section-title">Contributors</div><div class="contributors">' + contribHtml + '</div></div>';
    
    document.getElementById('content').innerHTML = html;
    
    var btn = document.getElementById('openBtn');
    btn.style.display = 'block';
    btn.onclick = function() {
      window.open('https://github.com/' + data.owner + '/' + data.repo, '_blank');
    };
  }

  function showError(msg) {
    document.getElementById('content').innerHTML = '<div class="error">' + msg + '</div>';
  }

  function init() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0]) {
        showError('Open a GitHub repo page');
        return;
      }
      var tab = tabs[0];
      chrome.tabs.sendMessage(tab.id, { action: 'getData' }, function(res) {
        if (chrome.runtime.lastError || !res || !res.data) {
          showError('Could not fetch data. Reload page.');
          return;
        }
        render(res.data);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
