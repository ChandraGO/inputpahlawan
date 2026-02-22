// api/get-pahlawan.js
// Vercel Serverless Function (Node.js)
// Ambil data uploads terbaru.
//
// Prioritas:
// 1) Ambil langsung dari GitHub (raw) supaya tidak menunggu redeploy Vercel
// 2) Jika ENV belum diset / gagal fetch, fallback baca file repo: data/pahlawan_uploads.json

import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    const owner = process.env.GITHUB_OWNER || 'ChandraGO';
    const repo  = process.env.GITHUB_REPO  || 'inputpahlawan';
    const branch = process.env.GITHUB_BRANCH || 'main';

    // 1) Try GitHub raw (paling up-to-date)
    if (owner && repo) {
      try {
        // raw.githubusercontent.com kadang ke-cache di layer CDN.
        // Tambahkan cache-buster query supaya data baru langsung kebaca.
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data/pahlawan_uploads.json?ts=${Date.now()}`;

        const r = await fetch(url, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-store' }
        });
        if (r.ok) {
          const data = await r.json().catch(() => []);
          res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('CDN-Cache-Control', 'no-store');
          res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
          return res.status(200).json(Array.isArray(data) ? data : []);
        }
        // kalau tidak ok, lanjut fallback lokal
      } catch (e) {
        // lanjut fallback lokal
      }
    }

    // 2) Fallback: baca file lokal (butuh redeploy untuk update)
    const filePath = path.join(process.cwd(), 'data', 'pahlawan_uploads.json');
    let local = [];
    try {
      const txt = fs.readFileSync(filePath, 'utf-8');
      local = JSON.parse(txt);
    } catch (e) {
      local = [];
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('CDN-Cache-Control', 'no-store');
          res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    return res.status(200).json(Array.isArray(local) ? local : []);
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
