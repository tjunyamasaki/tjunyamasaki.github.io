const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.md': 'text/plain; charset=utf-8',
  '.cjs': 'text/plain; charset=utf-8'
};
http.createServer((req, res) => {
  const name = req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).slice(1);
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(4174, '127.0.0.1', () => console.log('http://127.0.0.1:4174'));
