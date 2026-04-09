#!/bin/bash
set -e

echo "========================================="
echo "  文档在线预览系统 - 环境初始化"
echo "========================================="

if ! command -v docker &> /dev/null; then
    echo "[ERROR] 未检测到 Docker，请先安装 Docker"
    echo "银河麒麟系统安装命令: sudo apt install docker.io docker-compose"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "[ERROR] 未检测到 Docker Compose"
    exit 1
fi

if [ ! -f .env ]; then
    echo "[INFO] 创建 .env 配置文件..."
    cat > .env << 'EOF'
JWT_SECRET=change_this_to_a_random_string
ONLYOFFICE_PORT=8080
NODE_ENV=production
SERVER_PORT=3000
STORAGE_PATH=/data/documents
NGINX_PORT=80
EOF
    echo "[INFO] 请修改 .env 中的 JWT_SECRET"
fi

echo "[INFO] 创建字体目录..."
mkdir -p scripts/fonts

echo "[INFO] 构建并启动服务..."
docker-compose up -d --build

echo ""
echo "========================================="
echo "  启动完成!"
echo "  访问地址: http://localhost"
echo "  演示页面: http://localhost/demo/"
echo "========================================="
