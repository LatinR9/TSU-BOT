// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\updater.js
const https = require('https');
const packageJson = require('./package.json');

const CURRENT_VERSION = packageJson.version || '1.0.0';
const GITHUB_REPO = 'LatinR9/TSU-BOT';

function checkUpdate() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': 'TSU-BOT-Updater'
      },
      timeout: 5000
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const release = JSON.parse(data);
            const latestTag = (release.tag_name || '').replace(/^v/, '');
            const hasUpdate = isNewerVersion(latestTag, CURRENT_VERSION);

            const downloadAsset = (release.assets || []).find(a => a.name.endsWith('.exe')) || {
              browser_download_url: release.html_url
            };

            resolve({
              hasUpdate,
              currentVersion: CURRENT_VERSION,
              latestVersion: latestTag || CURRENT_VERSION,
              releaseName: release.name || release.tag_name,
              releaseNotes: release.body || '',
              downloadUrl: downloadAsset.browser_download_url || release.html_url
            });
          } else {
            resolve({
              hasUpdate: false,
              currentVersion: CURRENT_VERSION,
              latestVersion: CURRENT_VERSION,
              message: 'No releases found or repository is private.'
            });
          }
        } catch (e) {
          resolve({ hasUpdate: false, currentVersion: CURRENT_VERSION, error: e.message });
        }
      });
    });

    req.on('error', () => {
      resolve({ hasUpdate: false, currentVersion: CURRENT_VERSION, error: 'Network error checking for updates.' });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ hasUpdate: false, currentVersion: CURRENT_VERSION, error: 'Update check timed out.' });
    });
  });
}

function isNewerVersion(latest, current) {
  if (!latest) return false;
  const lParts = latest.split('.').map(n => parseInt(n, 10) || 0);
  const cParts = current.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

module.exports = {
  CURRENT_VERSION,
  checkUpdate
};
