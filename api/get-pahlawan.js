// pages/api/get-pahlawan.js

export default async function handler(req, res) {
  try {
    // 🔥 Anti cache keras (Vercel/CDN/Browser)
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    const url =
      "https://raw.githubusercontent.com/ChandraGO/inputpahlawan/main/data/pahlawan_uploads.json" +
      `?ts=${Date.now()}`; // cache-buster

    const r = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });

    if (!r.ok) {
      return res
        .status(500)
        .json({ error: `Failed to fetch uploads: ${r.status}` });
    }

    const data = await r.json().catch(() => []);
    return res.status(200).json(Array.isArray(data) ? data : []);
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
