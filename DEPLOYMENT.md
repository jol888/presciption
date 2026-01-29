# 处方生成服务器 Docker 部署指南

本指南介绍如何将处方生成服务器部署到 Render.com 作为演示。

## 文件结构

项目已添加以下部署文件：

1. **Dockerfile** - 容器化配置
2. **docker-compose.yml** - 本地开发配置
3. **render.yaml** - Render.com 部署配置
4. **DEPLOYMENT.md** - 本部署指南

## 部署到云平台

### 选项 A: 部署到 Render.com

#### 步骤 1: 准备 GitHub 仓库

1. 确保所有更改已提交到 GitHub
2. 确认以下文件在仓库中：
   - `Dockerfile`
   - `render.yaml`
   - `package.json`
   - `index.js`
   - `tex/` 目录中的所有文件

#### 步骤 2: 在 Render.com 创建服务

1. 登录 [Render.com](https://render.com)
2. 点击 "New +" → "Web Service"
3. 连接你的 GitHub 仓库
4. 选择仓库和分支
5. 配置服务：
   - **Name**: `prescription-server` (或自定义名称)
   - **Environment**: `Docker`
   - **Region**: 选择最近的区域
   - **Branch**: `main` (或你的部署分支)
   - **Plan**: Free 或 Starter (建议 Starter 以获得更好性能)

6. 点击 "Create Web Service"
7. Render 会自动检测 `render.yaml` 配置并开始部署

### 选项 B: 部署到 Koyeb

#### 步骤 1: 准备 GitHub 仓库

1. 确保所有更改已提交到 GitHub
2. 确认以下文件在仓库中：
   - `Dockerfile`
   - `koyeb.yaml`
   - `package.json`
   - `index.js`
   - `tex/` 目录中的所有文件

#### 步骤 2: 在 Koyeb 创建服务

1. 登录 [Koyeb](https://www.koyeb.com)
2. 点击 "Create App"
3. 选择 "GitHub" 作为部署源
4. 选择你的仓库和分支
5. Koyeb 会自动检测 `koyeb.yaml` 配置并开始部署

#### Koyeb 注意事项

1. **镜像大小限制**: Koyeb 有 2GB 镜像大小限制，已优化 Dockerfile 符合要求
2. **前台进程**: 确保应用在前台运行（已修改 CMD 为 `["bun", "index.js"]`）
3. **健康检查**: 配置了 `/status` 端点作为健康检查
4. **磁盘空间**: 配置了 2GB 磁盘空间以满足 TeX Live 需求

### 步骤 3: 获取授权码

由于授权码基于容器环境计算，部署后需要获取正确的授权码：

1. 部署完成后，访问服务 URL (如 `https://prescription-server.onrender.com`)
2. 查看控制台日志获取授权码信息
3. 或者通过 API 端点获取系统信息：
   ```
   GET /status
   ```

**授权码计算方式**：
```
授权码 = SHA256(username@hostname-CPU核心数).slice(0, 12).toUpperCase()
```

在容器环境中：
- `username`: 通常是 `root` 或 `bun`
- `hostname`: 容器 ID
- `CPU核心数`: 容器分配的 CPU 核心数

### 步骤 4: 测试部署

1. 访问 Web 界面：`https://your-service.onrender.com`
2. 使用获取的授权码测试处方生成
3. 检查健康状态：`https://your-service.onrender.com/status`

## 本地开发与测试

### 使用 Docker Compose

```bash
# 构建并启动服务
docker-compose up --build

# 在后台运行
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 直接使用 Docker

```bash
# 构建镜像
docker build -t prescription-server .

# 运行容器
docker run -p 3000:3000 -e PORT=3000 prescription-server

# 运行并设置环境变量
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e MAX_CONCURRENT_COMPILATIONS=3 \
  prescription-server
```

## 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | 服务器监听端口 |
| `MAX_CONCURRENT_COMPILATIONS` | 5 | 最大并发 LaTeX 编译数 |
| `COMPILATION_TIMEOUT_MS` | 30000 | 编译超时时间(毫秒) |
| `NODE_ENV` | production | 运行环境 |

## 资源限制

Render.com Free 计划限制：
- 512MB RAM
- 0.1 CPU 核心
- 1GB 磁盘空间
- 自动休眠（15分钟无流量）

建议使用 Starter 计划以获得：
- 更好的性能
- 无自动休眠
- 更多资源

## 故障排除

### 常见问题

1. **LaTeX 编译失败**
   - 检查容器日志中的错误信息
   - 确保所有 LaTeX 包已正确安装
   - 验证中文字体是否可用

2. **授权码不匹配**
   - 确认使用的是容器环境计算的授权码
   - 检查 `/status` 端点中的系统信息
   - 重新计算授权码

3. **内存不足**
   - 减少 `MAX_CONCURRENT_COMPILATIONS` 值
   - 升级到更高计划
   - 优化 LaTeX 编译设置

4. **服务自动休眠**
   - Free 计划会在15分钟无流量后休眠
   - 首次访问会有冷启动延迟
   - 考虑升级到 Starter 计划

### 日志查看

```bash
# Render.com 控制台
# 在 Render Dashboard → 你的服务 → Logs

# 本地 Docker 日志
docker-compose logs -f
```

## 安全注意事项

1. **授权机制**：保持授权码机制以限制滥用
2. **输入验证**：所有用户输入都经过严格验证
3. **资源限制**：限制并发编译防止资源耗尽
4. **临时文件**：每次编译后自动清理临时文件

## 更新部署

1. 推送更改到 GitHub
2. Render.com 会自动重新部署
3. 或手动触发重新部署：
   - Render Dashboard → 你的服务 → Manual Deploy

## 联系支持

- Render.com 支持：https://render.com/docs/support
- 项目 Issues：https://github.com/jol888/presciption/issues

---

**重要提醒**：本工具仅供持证执业医师技术验证使用。非法使用处方生成工具可能违反相关法律法规。