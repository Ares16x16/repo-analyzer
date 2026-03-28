# Repo Analyzer (Browser Extension)

Repo Analyzer is a Manifest V3 browser extension that analyzes GitHub repositories directly in the popup UI.
It reads repository data from the current GitHub page and presents a compact summary for quick evaluation.

## Highlights

- Manifest V3 compatible (no inline scripts)
- Works on public GitHub repository pages
- Shows repository metadata:
  - Description
  - Stars, forks, and open issues
  - License (when detectable)
  - Top language distribution (top 5)
  - Top contributors (avatar + login)
- Includes a repo health score for quick triage
- No backend required

## Installation (Load Unpacked)

1. Open `chrome://extensions` (or your Chromium browser's extensions page).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `browser-extension` folder from this repository.
5. Open a GitHub repository page and click the extension icon.

## Usage

1. Navigate to any GitHub repository (for example: `https://github.com/owner/repo`).
2. Click the Repo Analyzer extension icon.
3. Review repository stats, language breakdown, contributor list, and health score in the popup.

## Health Score

Current health score logic is calculated in `browser-extension/popup.js`:

- Base score:
  - `floor(stars / 50)`
  - `+ floor(forks / 20)`
  - `+ max(0, 50 - issues) / 5`
- Recency penalty:
  - Subtract up to 30 points based on days since last update
- Final score clamped between `0` and `100`

This score is a lightweight heuristic and should be treated as a quick signal, not a full quality audit.

## Project Structure

```text
.
|-- browser-extension/
|   |-- manifest.json
|   |-- content.js
|   |-- popup.html
|   |-- popup.js
|   `-- icon.svg
|-- .gitignore
`-- README.md
```

## Privacy and Data Handling

- The extension reads data from the currently opened GitHub page.
- It does not require a server backend.
- Contributor enrichment may request the repository's contributors page on `github.com` from the browser context.

## Development Notes

- Keep extension package artifacts and keys out of source control:
  - `*.crx`
  - `*.pem`
- Reload the unpacked extension after code changes.
- Hard refresh GitHub pages if cached content scripts are still running.

## Limitations

- GitHub DOM changes can affect selector-based scraping.
- Some repositories may hide or delay certain metadata in the UI.
- Private repositories depend on the browser session permissions of the signed-in user.

## Roadmap Ideas

- Export report as JSON
- Improved trend metrics (commit velocity, issue closure rate)
- Optional GitHub API mode for higher reliability

## Contributing

Issues and pull requests are welcome.
Please include:

- Reproduction steps
- Expected vs actual behavior
- Repository URL used for testing
