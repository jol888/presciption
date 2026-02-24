# Prescription-Server | 医疗处方生成系统

本系统是一个基于 Node.js/Bun 和 XeLaTeX 的医疗处方辅助排版工具。

> 警告：本程序仅供持证执业医师技术验证使用。根据《执业医师法》，非医师行医属违法行为，利用本工具非法开具处方将承担刑事责任。

## 🚀 快速开始

### 关于 DEMO

**跪求巨佬搭 DEMO**

### 本地运行

1. 安装 XeLaTeX
> 建议使用 MiKLaTeX 提供 XeLaTeX. 若使用 MiKLaTeX 运行时下载依赖，首次编译 PDF 用时将较久，取决于服务器网络。
2. 运行分发的可执行文件
3. 访问显示的服务器地址

要获取授权码，请自行阅读 `index.js` 中的 `getTargetAuthCode` 函数。

### Docker 部署

项目已容器化，支持部署到 Render.com 等平台：

```bash
# 使用 Docker Compose
docker-compose up --build

# 或直接使用 Docker
docker build -t prescription-server .
docker run -p 3000:3000 prescription-server
```

详细部署指南请参阅 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 📦 构建

安装 [bun](https://bun.com/)，然后：

```bash
bun run build:all
```

（二进制文件自动镶嵌模板文件）

## 🐳 Docker 部署

项目包含完整的 Docker 配置：

- `Dockerfile` - 容器化配置
- `docker-compose.yml` - 本地开发配置  
- `render.yaml` - Render.com 部署配置
- `DEPLOYMENT.md` - 详细部署指南

### 部署到 Render.com

1. 推送代码到 GitHub
2. 在 Render.com 创建 Web Service
3. 连接 GitHub 仓库
4. Render 会自动使用 `render.yaml` 配置部署

## ⚖️ 开源协议

本项目采用 GNU Affero General Public License v3.0 协议：
+ 源码公开：如果您通过网络提供此服务，必须向用户公开您的完整源代码。
+ 保留声明：必须保留控制台启动时的法律警告窗口及页脚版权信息。
+ 免责声明：作者不承担任何因医疗误操作或非法行医导致的法律后果。

排版来源于 [https://github.com/YukariChiba/prescription](https://github.com/YukariChiba/prescription)

> 由 Bun 强力驱动 | 严禁用于非法行医
