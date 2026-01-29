# 处方生成服务器 Dockerfile
# 优化镜像大小，支持中文LaTeX编译
# 使用最小化TeX Live安装以减少镜像大小

# 使用单阶段构建简化镜像
FROM oven/bun:debian

# 安装最小化的LaTeX和相关依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-xetex \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    texlive-lang-chinese \
    texlive-pstricks \
    fonts-wqy-zenhei \
    ghostscript \
    # 清理缓存以减小镜像大小
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/*

# 创建工作目录
WORKDIR /app

# 复制package.json和bun.lock
COPY package.json bun.lock ./

# 安装依赖
RUN bun install --production

# 复制应用程序文件
COPY index.js ./
COPY signPng.js ./
COPY index.html ./
COPY styles.css ./
COPY tex/ ./tex/

# 创建必要的目录
RUN mkdir -p temp

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV MAX_CONCURRENT_COMPILATIONS=5
ENV COMPILATION_TIMEOUT_MS=30000

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "import('node:http').then(http => http.get('http://localhost:3000/status', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1)))"

# 启动命令
CMD ["bun", "run", "index.js"]