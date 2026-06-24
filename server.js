const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, "outputs");
const MAX_BODY_BYTES = 64 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4"
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/lead") {
      await handleLead(req, res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { ok: false, message: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, message: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Landing is running on port ${PORT}`);
});

function serveStatic(req, res) {
  const requestedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const cleanPath = requestedUrl.pathname === "/" ? "/index.html" : requestedUrl.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      serveIndexFallback(req, res);
      return;
    }

    streamFile(req, res, filePath, stats);
  });
}

function serveIndexFallback(req, res) {
  const indexPath = path.join(PUBLIC_DIR, "index.html");

  fs.stat(indexPath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    streamFile(req, res, indexPath, stats);
  });
}

function streamFile(req, res, filePath, stats) {
  const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
  const baseHeaders = {
    "Content-Type": contentType,
    "Cache-Control": cacheHeader(filePath),
    "Accept-Ranges": "bytes"
  };
  const range = req.headers.range;

  if (range && stats.size > 0) {
    const match = range.match(/bytes=(\d*)-(\d*)/);

    if (!match) {
      res.writeHead(416, {
        ...baseHeaders,
        "Content-Range": `bytes */${stats.size}`
      });
      res.end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stats.size - 1;
    const safeEnd = Math.min(end, stats.size - 1);

    if (start >= stats.size || safeEnd < start) {
      res.writeHead(416, {
        ...baseHeaders,
        "Content-Range": `bytes */${stats.size}`
      });
      res.end();
      return;
    }

    res.writeHead(206, {
      ...baseHeaders,
      "Content-Length": safeEnd - start + 1,
      "Content-Range": `bytes ${start}-${safeEnd}/${stats.size}`
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
    return;
  }

  res.writeHead(200, {
    ...baseHeaders,
    "Content-Length": stats.size
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

async function handleLead(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    sendJson(res, 503, {
      ok: false,
      message: "Telegram is not configured"
    });
    return;
  }

  const lead = await readJsonBody(req);
  const validationError = validateLead(lead);

  if (validationError) {
    sendJson(res, 400, { ok: false, message: validationError });
    return;
  }

  const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      text: formatTelegramMessage(lead, req)
    })
  });

  if (!telegramResponse.ok) {
    const errorText = await telegramResponse.text();
    console.error("Telegram error:", errorText);
    sendJson(res, 502, {
      ok: false,
      message: "Telegram delivery failed"
    });
    return;
  }

  sendJson(res, 200, { ok: true });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function validateLead(lead) {
  if (!lead || typeof lead !== "object") return "Empty lead";
  if (!clean(lead.name)) return "Name is required";
  if (!clean(lead.phone)) return "Phone is required";
  if (!clean(lead.telegram).startsWith("@")) return "Telegram username must start with @";
  if (!clean(lead.instagram).startsWith("@")) return "Instagram username must start with @";
  return "";
}

function formatTelegramMessage(lead, req) {
  const submittedAt = new Date().toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  return [
    "<b>Нова заявка з лендингу</b>",
    "",
    `<b>Імʼя:</b> ${escapeHtml(clean(lead.name))}`,
    `<b>Телефон:</b> ${escapeHtml(clean(lead.phone))}`,
    `<b>Telegram:</b> ${escapeHtml(clean(lead.telegram))}`,
    `<b>Instagram:</b> ${escapeHtml(clean(lead.instagram))}`,
    "",
    `<b>Сторінка:</b> ${escapeHtml(clean(lead.source) || "mini-landing-targetolog-2026")}`,
    `<b>Час:</b> ${escapeHtml(submittedAt)}`,
    `<b>IP:</b> ${escapeHtml(getClientIp(req))}`
  ].join("\n");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "";
}

function cacheHeader(filePath) {
  if ([".html", ".css", ".js"].includes(path.extname(filePath))) return "no-store";
  return "public, max-age=300";
}
