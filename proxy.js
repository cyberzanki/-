// Q8 SuperClaw — reverse proxy on port 10000
// Routes /q8approve to the approver, everything else to the openclaw gateway (port 18789)
const http = require('http');
const { exec } = require('child_process');

const GATEWAY_PORT = 18789;
const PROXY_PORT   = parseInt(process.env.PORT || '10000', 10);
const SECRET       = process.env.OPENCLAW_GATEWAY_TOKEN || 'q8superclaw2026';

// ---------- HTTP server ----------
const server = http.createServer((req, res) => {
  let parsedUrl;
  try { parsedUrl = new URL(req.url, 'http://localhost'); } catch (e) { parsedUrl = null; }

  // /q8approve?secret=<token>  →  approve latest pending device
  if (parsedUrl && parsedUrl.pathname === '/q8approve') {
    if (parsedUrl.searchParams.get('secret') !== SECRET) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    exec(
      'openclaw devices approve --latest',
      { env: { ...process.env, OPENCLAW_STATE_DIR: '/data' } },
      (err, stdout, stderr) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(
          '=== stdout ===\n' + (stdout || '(empty)') +
          '\n=== stderr ===\n' + (stderr || '(empty)') +
          '\n=== exit ===\n'  + (err ? err.code : 0) + '\n'
        );
      }
    );
    return;
  }

  // Everything else → proxy to gateway
  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port:     GATEWAY_PORT,
      path:     req.url,
      method:   req.method,
      headers:  req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );
  proxyReq.on('error', (e) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('gateway not ready: ' + e.message);
    }
  });
  req.pipe(proxyReq, { end: true });
});

// ---------- WebSocket upgrade → tunnel to gateway ----------
server.on('upgrade', (req, socket, head) => {
  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port:     GATEWAY_PORT,
    path:     req.url,
    method:   req.method,
    headers:  req.headers,
  });
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    // Forward 101 response headers back to the client
    const headerLines = Object.entries(proxyRes.headers)
      .map(([k, v]) => k + ': ' + v)
      .join('\r\n');
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' + headerLines + '\r\n\r\n');

    if (proxyHead && proxyHead.length) proxySocket.write(proxyHead);
    if (head      && head.length)      proxySocket.write(head);

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    socket.on('error',     () => proxySocket.destroy());
    proxySocket.on('error',() => socket.destroy());
  });
  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log('[q8-proxy] listening on :' + PROXY_PORT);
  console.log('[q8-proxy] approve → https://q8-superclaw.onrender.com/q8approve?secret=' + SECRET);
});
