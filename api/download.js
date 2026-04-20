const https = require("https");
const http = require("http");

function fetchStream(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        Referer: "https://www.instagram.com/",
        Accept: "*/*",
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return resolve(fetchStream(res.headers.location));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        body: Buffer.concat(chunks),
        contentType: res.headers["content-type"] || "video/mp4",
      }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

module.exports = async (req, res) => {
  const { url, filename = "reel.mp4" } = req.query || {};

  if (!url) return res.status(400).json({ error: "URL ausente" });

  try {
    const { body, contentType } = await fetchStream(decodeURIComponent(url));
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(body);
  } catch (err) {
    res.status(500).json({ error: "Falha no download: " + err.message });
  }
};
