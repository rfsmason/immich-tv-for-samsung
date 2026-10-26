import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, normalize, resolve } from "node:path";

const rootArgIndex = process.argv.indexOf("--root");
const root =
  rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
    ? resolve(process.cwd(), process.argv[rootArgIndex + 1])
    : process.cwd();
const host = "127.0.0.1";
const strictPort = process.env.PREVIEW_STRICT_PORT === "1";
const startPort = Number(process.env.PORT || 5173);
if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
  throw new Error("PORT must be an integer from 1 to 65535.");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const indexPath = resolve(root, "index.html");
const previewScriptTag = '    <script src="scripts/dev-preview.js"></script>\n';
const mainScriptTag = '    <script src="scripts/main.js"></script>';
const proxyPath = "/__immich-proxy";

function getRequestPath(url) {
  const parsed = new URL(url, "http://localhost");
  const pathname = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
  const decoded = decodeURIComponent(pathname);
  const resolved = resolve(root, "." + normalize(decoded));

  if (!resolved.startsWith(root)) {
    return null;
  }

  return resolved;
}

async function handleRequest(request, response) {
  if (request.url === proxyPath && request.method === "POST") {
    handleProxyRequest(request, response);
    return;
  }

  const filePath = getRequestPath(request.url || "/");

  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    if (filePath === indexPath) {
      const html = await readFile(filePath, "utf8");
      const previewHtml = html.includes(mainScriptTag)
        ? html.replace(mainScriptTag, `${previewScriptTag}${mainScriptTag}`)
        : html.replace("</body>", `${previewScriptTag}  </body>`);
      const body = Buffer.from(previewHtml);

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": body.length,
        "Content-Type": contentTypes[".html"]
      });
      response.end(body);
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": fileStat.size,
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });

    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

function readRequestBody(request) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];

    request.on("data", function (chunk) {
      chunks.push(chunk);
    });

    request.on("end", function () {
      resolvePromise(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", reject);
  });
}

function getProxyHeaders(headers) {
  const allowedHeaders = ["accept", "content-type", "x-api-key"];
  const proxyHeaders = {};

  for (const header of allowedHeaders) {
    if (headers && headers[header]) {
      proxyHeaders[header] = headers[header];
    }
  }

  return proxyHeaders;
}

async function handleProxyRequest(request, response) {
  try {
    const payload = JSON.parse(await readRequestBody(request));
    const targetUrl = new URL(payload.url);

    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      throw new Error("Unsupported proxy URL.");
    }

    const proxyResponse = await fetch(targetUrl, {
      body: payload.body || undefined,
      headers: getProxyHeaders(payload.headers),
      method: payload.method || "GET"
    });
    const body = Buffer.from(await proxyResponse.arrayBuffer());

    response.writeHead(proxyResponse.status, {
      "Cache-Control": "no-store",
      "Content-Length": body.length,
      "Content-Type": proxyResponse.headers.get("content-type") || "application/octet-stream"
    });
    response.end(body);
  } catch (error) {
    const body = Buffer.from(
      JSON.stringify({
        message: error.message || "Preview proxy request failed."
      })
    );

    response.writeHead(502, {
      "Cache-Control": "no-store",
      "Content-Length": body.length,
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(body);
  }
}

function listen(port) {
  const server = createServer((request, response) => {
    handleRequest(request, response);
  });

  server.on("error", function (error) {
    if (!strictPort && error.code === "EADDRINUSE" && port < Math.min(startPort + 20, 65535)) {
      listen(port + 1);
      return;
    }

    throw error;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
  }

  server.listen(port, host, function () {
    console.log(`Preview server running at http://${host}:${port}/`);
    process.send?.({ ready: true });
  });
}

listen(startPort);
