#!/bin/bash
echo "========================================="
echo "  银河麒麟系统兼容性测试"
echo "========================================="

echo ""
echo "[1/5] 检测操作系统..."
if [ -f /etc/kylin-release ]; then
    echo "  银河麒麟系统: $(cat /etc/kylin-release)"
elif [ -f /etc/os-release ]; then
    echo "  操作系统: $(grep PRETTY_NAME /etc/os-release | cut -d'"' -f2)"
else
    echo "  未知操作系统"
fi

echo ""
echo "[2/5] 检测 CPU 架构..."
ARCH=$(uname -m)
echo "  架构: $ARCH"
if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "aarch64" ]; then
    echo "  [PASS] 支持的架构"
else
    echo "  [WARN] 未经测试的架构"
fi

echo ""
echo "[3/5] 检测 Docker..."
if command -v docker &> /dev/null; then
    echo "  Docker: $(docker --version)"
    echo "  [PASS] Docker 已安装"
else
    echo "  [FAIL] Docker 未安装"
fi

echo ""
echo "[4/5] 检测浏览器..."
BROWSERS=("chromium-browser" "google-chrome" "firefox" "qaxbrowser")
for br in "${BROWSERS[@]}"; do
    if command -v "$br" &> /dev/null; then
        echo "  [FOUND] $br"
    fi
done

echo ""
echo "[5/5] 检测服务状态..."
if curl -s http://localhost/api/health > /dev/null 2>&1; then
    echo "  后端服务: [RUNNING]"
else
    echo "  后端服务: [STOPPED]"
fi

if curl -s http://localhost > /dev/null 2>&1; then
    echo "  前端服务: [RUNNING]"
else
    echo "  前端服务: [STOPPED]"
fi

echo ""
echo "========================================="
echo "  测试完成"
echo "========================================="
