// api/get-pahlawan.js
// Vercel Serverless Function (Node.js)
// Ambil data uploads terbaru langsung dari GitHub (tanpa menunggu redeploy Vercel)

export default async function handler(req, res) {
  try {
    const owner = process.env.GITHUB_OWNER;
    const repo  = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!owner || !repo) {
      return res.status(500).json({ error: 'ENV belum lengkap: GITHUB_OWNER, GITHUB_REPO (dan optional GITHUB_BRANCH)' });
    }

    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data/pahlawan_uploads.json`;

    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      return res.status(500).json({ error: `Gagal fetch data dari GitHub: HTTP ${r.status}` });
    }

    const data = await r.json().catch(() => []);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(Array.isArray(data) ? data : []);
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
