const repository = 'https://github.com/Mclarenlife/Texite';
const platforms = { windows: 'windows-x64.exe', macos: 'arm64.dmg' };

// Update only a complete stable release, with installer URLs in this repository.
export function parseRelease(release) {
  if (!release || release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) return null;
  const tag = release.tag_name;
  const url = `${repository}/releases/tag/${tag}`;
  if (release.html_url !== url || !Array.isArray(release.assets)) return null;
  const downloads = {};
  for (const [platform, suffix] of Object.entries(platforms)) {
    const name = `Texite-${tag.slice(1)}-${suffix}`;
    const asset = release.assets.find(item => item.name === name && item.state === 'uploaded' && item.size > 0);
    const download = `${repository}/releases/download/${tag}/${name}`;
    if (!asset || asset.browser_download_url !== download) return null;
    downloads[platform] = { url: download, checksum: /^sha256:[a-f0-9]{64}$/i.test(asset.digest || '') ? asset.digest.slice(7).toLowerCase() : null };
  }
  return { tag, url, downloads };
}

function isOlder(candidate, current) {
  const a = candidate.slice(1).split('.').map(Number), b = current.slice(1).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] < b[i]; }
  return false;
}

export async function updateDownloads(doc = document, request = fetch) {
  try {
    const response = await request('https://api.github.com/repos/Mclarenlife/Texite/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const release = parseRelease(await response.json());
    const current = doc.querySelector('[data-release-version]')?.textContent.trim();
    if (!release || !/^v\d+\.\d+\.\d+$/.test(current || '') || isOlder(release.tag, current)) return false;
    const checksums = [...doc.querySelectorAll('[data-release-checksum]')];
    if (checksums.some(node => !release.downloads[node.dataset.releaseChecksum]?.checksum)) return false;
    doc.querySelectorAll('[data-download-platform]').forEach(node => {
      const asset = release.downloads[node.dataset.downloadPlatform];
      if (asset) node.href = asset.url;
    });
    doc.querySelectorAll('[data-release-version]').forEach(node => { node.textContent = release.tag; });
    doc.querySelectorAll('[data-release-url]').forEach(node => { node.href = release.url; });
    checksums.forEach(node => { node.textContent = release.downloads[node.dataset.releaseChecksum].checksum; });
    return true;
  } catch {
    // Offline, timeout or GitHub rate limit: retain verified HTML download links.
    return false;
  }
}

if (typeof document !== 'undefined') void updateDownloads();
