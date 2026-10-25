import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 开发服务器数据接口：
 *   GET  /api/project  读取 data/castle.json
 *   PUT  /api/project  写回 data/castle.json（先写临时文件再替换，避免写坏）
 */
function projectDataPlugin(): Plugin {
  const dataFile = path.resolve(process.cwd(), 'data', 'castle.json');

  return {
    name: 'project-data-api',
    configureServer(server) {
      server.middlewares.use('/api/project', (req, res) => {
        if (req.method === 'GET') {
          try {
            const text = fs.readFileSync(dataFile, 'utf-8');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(text);
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
          return;
        }

        if (req.method === 'PUT' || req.method === 'POST') {
          let body = '';
          req.setEncoding('utf8');
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const tmp = `${dataFile}.tmp`;
              fs.mkdirSync(path.dirname(dataFile), { recursive: true });
              fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
              fs.renameSync(tmp, dataFile);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: String(err) }));
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end();
      });
    }
  };
}

export default defineConfig({
  plugins: [projectDataPlugin()],
  server: {
    port: 8088,
    host: '0.0.0.0',
    watch: {
      // 数据文件由编辑器自己写入，不触发页面刷新
      ignored: ['**/data/**']
    }
  }
});
