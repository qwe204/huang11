# Electron 桌面版构建与共享说明（Windows / 麒麟 Linux）

## 1. 安装依赖

在项目根目录执行：

```bash
npm install
npm run install:deps
```

如果 PowerShell 禁止执行 `npm.ps1`，请改用：

```bash
npm.cmd install
npm.cmd run install:deps
```

## 2. 本地开发调试

```bash
npm run desktop:dev
```

该命令会同时启动：

1. 前端开发服务（Vite，默认 `5173`）
2. Electron 主进程
3. 内置后端（默认优先 `3000`，不可用时回退 `3001`~`3005`）

## 3. 打包命令

### 3.1 Windows 包

```bash
npm run desktop:verify:win
npm run desktop:pack:win
```

如需 Zip：

```bash
npm run desktop:pack:win:zip
```

### 3.2 麒麟 Linux 包（推荐在 Linux 环境构建）

```bash
npm run desktop:verify:kylin
npm run desktop:pack:kylin:deb
```

如需同时构建 `deb + AppImage`：

```bash
npm run desktop:pack:kylin
```

## 4. Windows 下构建麒麟包（推荐 Docker）

Windows 原生环境常见问题：

1. 缺少 `fpm` 导致 `.deb` 失败
2. 缺少符号链接权限导致 `AppImage` 失败

建议使用 Linux 容器构建：

```bash
docker run --rm -v "$PWD:/project" -w /project electronuserland/builder:latest /bin/bash -lc "set -euo pipefail; export npm_config_cache=/project/.npm-cache-linux; apt-get update; apt-get install -y ruby ruby-dev build-essential; gem install --no-document fpm; npm ci; npm --prefix web-component ci; npm run desktop:pack:kylin:deb"
```

## 5. 产物目录

```text
release/
```

常见产物：

1. Windows：`*.exe` / `*.zip`
2. 麒麟 Linux：`*.deb` / `*.AppImage`

## 6. 麒麟 Linux 安装与启动

安装：

```bash
sudo dpkg -i "文档管理组件-1.0.0-linux-amd64.deb"
sudo apt-get install -f -y
```

启动：

```bash
doc-preview-desktop
```

若 PATH 未生效，可直接运行：

```bash
/opt/文档管理组件/doc-preview-desktop
```

## 7. 桌面版作为服务端共享给其他电脑

桌面版已支持“客户端机器同时作为服务端”。每台安装机都可通过 `desktop.env` 配置共享。

推荐配置：

```env
DESKTOP_SHARE_ENABLED=true
DESKTOP_PORT=3000
DESKTOP_BIND_HOST=0.0.0.0
DESKTOP_PUBLIC_HOST=auto
DESKTOP_PUBLIC_URL=
ONLYOFFICE_URL=http://127.0.0.1:8080
ONLYOFFICE_PUBLIC_URL=http://<本机IP>:8080
AUTH_JWT_SECRET=<强随机字符串>
```

说明：

1. `DESKTOP_SHARE_ENABLED=true`：开启共享模式
2. `DESKTOP_PORT=3000`：固定服务端口，便于客户访问
3. `DESKTOP_BIND_HOST=0.0.0.0`：允许局域网访问
4. `DESKTOP_PUBLIC_HOST=auto`：自动探测本机局域网 IP
5. `DESKTOP_PUBLIC_URL`：如需固定公网/域名可手动设置，优先级高于自动探测

部署后访问：

```text
http://<服务机IP>:3000
```

健康检查：

```text
http://<服务机IP>:3000/api/health
```

## 8. 常见问题

### 8.1 `better_sqlite3.node: invalid ELF header`

表示混入了非 Linux 平台编译产物。请在 Linux 环境重建：

1. 清空 `server/node_modules`
2. 重新安装 Linux 依赖
3. 重新执行 `desktop:pack:kylin:deb`

### 8.2 默认管理员账号

首次运行会创建默认管理员：

```text
admin / 123456
```

上线后请立即修改密码。
