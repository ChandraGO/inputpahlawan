// api/upload.js
// Vercel Serverless Function (Node.js)
// Upload image -> GitHub repo (images/...) + update JSON (data/pahlawan_uploads.json)

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
      nama_pahlawan,
      filename,
      mime,
      data_url
    } = req.body || {};

    if (!nama_pahlawan || !data_url) {
      return res.status(400).json({ error: 'nama_pahlawan dan data_url wajib diisi' });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo  = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token || !owner || !repo) {
      return res.status(500).json({ error: 'ENV belum lengkap: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO (dan optional GITHUB_BRANCH)' });
    }

    // data_url format: "data:image/png;base64,AAAA..."
    const match = String(data_url).match(/^data:(.+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'data_url tidak valid' });

    const detectedMime = match[1];
    const b64 = match[2];

    const safeMime = mime || detectedMime;
    const ext = mimeToExt(safeMime) || extFromFilename(filename) || 'png';

    const slug = slugify(nama_pahlawan);
    const unique = Date.now().toString(36);
    const imagePath = `images/${slug}-${unique}.${ext}`;

    // 1) Upload image file
    const imagePut = await githubPutFile({
      token, owner, repo, branch,
      path: imagePath,
      message: `Upload image pahlawan: ${nama_pahlawan}`,
      contentBase64: b64
    });

    const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imagePath}`;

    // 2) Update JSON file: data/pahlawan_uploads.json (dengan retry jika SHA berubah)
    const jsonPath = 'data/pahlawan_uploads.json';
    const nowIso = new Date().toISOString();

    const record = { nama_pahlawan, image_url: imageUrl, uploaded_at: nowIso };

    const jsonPut = await githubUpdateUploadsJsonWithRetry({
      token, owner, repo, branch,
      path: jsonPath,
      record
    });

    return res.status(200).json({
      ok: true,
      nama_pahlawan,
      image_url: imageUrl,
      json_path: jsonPath,
      commit_url: jsonPut?.commit?.html_url || null
    });

  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')               // hapus apostrophe
    .replace(/[^a-z0-9]+/g, '-')        // non-alnum -> -
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'pahlawan';
}

function mimeToExt(m) {
  const x = String(m || '').toLowerCase();
  if (x.includes('jpeg')) return 'jpg';
  if (x.includes('jpg')) return 'jpg';
  if (x.includes('png')) return 'png';
  if (x.includes('webp')) return 'webp';
  if (x.includes('gif')) return 'gif';
  return null;
}

function extFromFilename(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : null;
}

async function githubApi(token, url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });

  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!resp.ok) {
    const msg = data?.message ? `${data.message}` : `HTTP ${resp.status}`;
    throw new Error(`GitHub API error: ${msg}`);
  }
  return data;
}

async function githubPutFile({ token, owner, repo, branch, path, message, contentBase64, sha }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}`;
  const body = {
    message,
    content: contentBase64,
    branch
  };
  if (sha) body.sha = sha;

  return githubApi(token, url, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

async function githubGetJsonFile({ token, owner, repo, branch, path }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}?ref=${encodeURIComponent(branch)}`;
  const data = await githubApi(token, url, { method: 'GET' });

  // data.content is base64 with newlines sometimes
  const b64 = String(data.content || '').replace(/\n/g, '');
  const jsonText = Buffer.from(b64, 'base64').toString('utf8');
  const json = JSON.parse(jsonText);

  return { json, sha: data.sha };
}


async function githubUpdateUploadsJsonWithRetry({ token, owner, repo, branch, path, record, maxRetries = 1 }) {
  // maxRetries=1 berarti total attempt = 1 (awal) + 1 retry = 2
  let attempt = 0;
  let lastErr = null;

  while (attempt <= maxRetries) {
    try {
      // Ambil JSON + sha terbaru
      const { json, sha } = await githubGetJsonFile({ token, owner, repo, branch, path });

      const arr = Array.isArray(json) ? json : [];

      // Hindari duplikat: kalau nama_pahlawan sudah ada, replace record-nya
      const next = arr.filter(x => String(x?.nama_pahlawan || '').trim() !== String(record.nama_pahlawan).trim());
      next.push(record);

      // Optional: sort by uploaded_at (desc) biar rapi
      next.sort((a, b) => String(b?.uploaded_at || '').localeCompare(String(a?.uploaded_at || '')));

      const contentBase64 = Buffer.from(JSON.stringify(next, null, 2), 'utf8').toString('base64');

      return await githubPutFile({
        token, owner, repo, branch,
        path,
        sha,
        message: `Update uploads JSON: ${record.nama_pahlawan}`,
        contentBase64
      });

    } catch (err) {
      lastErr = err;

      // Deteksi SHA mismatch / file berubah di antara GET dan PUT
      const msg = String(err?.message || err);
      const isShaMismatch =
        msg.includes('but expected') ||
        msg.includes('sha') && msg.includes('expected') ||
        msg.includes('does not match') ||
        msg.includes('was not expected');

      if (isShaMismatch && attempt < maxRetries) {
        attempt += 1;
        continue; // retry dengan sha terbaru
      }

      throw err;
    }
  }

  throw lastErr || new Error('Unknown error updating JSON');
}
