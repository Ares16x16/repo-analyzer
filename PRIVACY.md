# Privacy Policy — Repo Analyzer

**Last updated:** 2026-09-09  
**Extension version:** 5.0.0

Repo Analyzer is a **local-first** Manifest V3 browser extension. It analyzes the GitHub repository page you already have open in your browser.

## What data is read

- Visible repository metadata from the current `https://github.com/*` page (description, star/fork/issue counts, license text, language labels, contributor avatars/logins when present in the DOM).
- Optionally, the extension may request the same repository's `/contributors` HTML page on `github.com` from your browser session to enrich the contributor list when the main page does not show enough avatars.

## What is not collected

- No analytics, crash reporting, or telemetry.
- No backend server of ours receives repository data.
- No GitHub personal access token is required or stored.
- Scraped data is used only to render the extension popup (and, if you choose **Copy JSON**, placed on your local clipboard).

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the tab you open the popup on. |
| `scripting` | Inject the content script if it is not already present (e.g. after install or soft navigation). |
| Host `https://github.com/*` | Run on GitHub pages and optionally fetch the contributors page for the same origin. |

## Storage

The extension does **not** use `chrome.storage` for repository reports. Closing the popup discards the in-memory analysis.

## Contact

Maintainer: [@Ares16x16](https://github.com/Ares16x16)
