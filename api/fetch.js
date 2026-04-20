const https = require("https");
const http = require("http");

function fetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        Accept: "*/*",
        ...headers,
      },
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return resolve(fetchBuffer(res.headers.location, headers));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ body: Buffer.concat(chunks), headers: res.headers, status: res.statusCode }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function extractShortcode(url) {
  const m = url.match(/\/(reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[2] : null;
}

async function fetchInstagramData(url) {
  const shortcode = extractShortcode(url);
  if (!shortcode) throw new Error("Link inválido. Use o link de um Reel ou post.");

  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const result = await fetchBuffer(embedUrl, {
    Referer: "https://www.instagram.com/",
    Accept: "text/html,application/xhtml+xml",
  });

  const html = result.body.toString("utf8");
  const videoUrls = [];
  const imgUrls = [];

  const videoMatches = html.matchAll(/"video_url"\s*:\s*"([^"]+)"/g);
  for (const m of videoMatches) {
    const u = m[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
    if (!videoUrls.includes(u)) videoUrls.push(u);
  }

  const videoSrcMatches = html.matchAll(/<video[^>]+src="([^"]+)"/g);
  for (const m of videoSrcMatches) {
    const u = m[1].replace(/&amp;/g, "&");
    if (!videoUrls.includes(u)) videoUrls.push(u);
  }

  const imgMatches = html.matchAll(/"display_url"\s*:\s*"([^"]+)"/g);
  for (const m of imgMatches) {
    const u = m[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
    if (!imgUrls.includes(u)) imgUrls.push(u);
  }

  const userMatch = html.match(/"username"\s*:\s*"([^"]+)"/) || html.match(/class="Username[^>]*>@?([^<]+)</);
  const username = userMatch ? userMatch[1] : "desconhecido";

  const captionMatch = html.match(/"text"\s*:\s*"([^"]{0,200})/);
  const caption = captionMatch ? captionMatch[1].replace(/\\n/g, " ").replace(/\\"/g, '"') : "";

  if (videoUrls.length === 0 && imgUrls.length === 0) {
    throw new Error("Não foi possível extrair o conteúdo. O post pode ser privado ou o link está incorreto.");
  }

  return {
    type: videoUrls.length > 0 ? "video" : "image",
    username: "@" + username,
    caption,
    shortcode,
    thumbnail: imgUrls[0] || null,
    videoUrl: videoUrls[0] || null,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { url } = JSON.parse(body || "{}");
    if (!url) return res.status(400).json({ error: "URL ausente" });
    const data = await fetchInstagramData(url);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erro ao buscar o post." });
  }
};
