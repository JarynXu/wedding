import http.server
import socketserver
import os
import sys

PORT = 8080
DIRECTORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    # 在 Windows 上设置 SO_REUSEADDR 会允许多个进程强行绑定同个端口造成串流与死锁，因此 Windows 上禁用
    allow_reuse_address = (sys.platform != 'win32')

def get_ip():
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None

if __name__ == '__main__':
    server_address = ('0.0.0.0', PORT)
    try:
        httpd = ThreadingHTTPServer(server_address, Handler)
    except OSError as e:
        print(f"\n[错误] 端口 {PORT} 启动失败: {e}")
        print(f"请检查是否已有其他 Python 进程占用了 {PORT} 端口。")
        sys.exit(1)

    lan_ip = get_ip()
    print(f"\nServer is running serving {DIRECTORY}:", flush=True)
    print(f"  > Local:    http://localhost:{PORT}/", flush=True)
    print(f"  > Loopback: http://127.0.0.1:{PORT}/", flush=True)
    if lan_ip and lan_ip != '127.0.0.1':
        print(f"  > Network:  http://{lan_ip}:{PORT}/ (手机/局域网设备可用)", flush=True)
    print(f"\nPress Ctrl+C to stop.\n", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
