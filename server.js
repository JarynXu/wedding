const express = require('express');
const compression = require('compression');
const path = require('path');
const os = require('os');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = __dirname;

// 1. 开启 Gzip/Brotli 高性能压缩（针对 2.7K 视网膜高清海报与网页素材）
app.use(compression({
  filter: (req, res) => {
    // MP3 音频本身已为有损压缩格式，无需额外耗费 CPU 压缩
    if (req.headers['x-no-compression'] || req.url.endsWith('.mp3')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// 2. 容器健康检查端点（微信云托管 / 腾讯云 CloudBase / K8s 探针检测必须）
app.get(['/healthz', '/livez', '/readyz'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: 'wedding-invitation',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// 3. 日历邀请文件 (.ics) 专属处理：支持 iOS Safari / 微信直接唤起系统日历
app.use((req, res, next) => {
  if (req.path.endsWith('.ics')) {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="wedding.ics"');
  }
  next();
});

// 4. 静态资源托管（包含 index.html, assets, 音频等，原生支持 HTTP 206 范围断点续传）
app.use(express.static(ROOT_DIR, {
  index: ['index.html', '婚礼请柬.html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.html')) {
      // HTML 文件不走强缓存，确保用户随时打开都是最新版本
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// 5. SPA 路由兜底，保证任何路径访问都能返回请柬首页
app.use((req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// 获取本机局域网 IPv4 地址（方便开发时手机测试）
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// 启动服务监听
const server = app.listen(PORT, HOST, () => {
  const ips = getLocalIPs();
  console.log('\n======================================================');
  console.log('  💌 婚礼请柬 Node.js Web 服务已成功启动！');
  console.log('------------------------------------------------------');
  console.log(`  ➜ 运行环境:    ${process.env.NODE_ENV || 'production'}`);
  console.log(`  ➜ 本地访问:    http://localhost:${PORT}/`);
  if (ips.length > 0) {
    ips.forEach(ip => {
      console.log(`  ➜ 手机/局域网:  http://${ip}:${PORT}/`);
    });
  }
  console.log(`  ➜ 容器探针:    http://localhost:${PORT}/healthz`);
  console.log('======================================================\n');
});

// 容器优雅停机（支持微信云托管平滑滚动发布与关闭）
const gracefulShutdown = (signal) => {
  console.log(`\n[${signal}] 正在平滑停止 Web 服务...`);
  server.close(() => {
    console.log('服务已安全释放，进程退出。');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('平滑退出超时，强制退出。');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

