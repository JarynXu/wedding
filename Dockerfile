# ============================================================
# 微信云托管 / 腾讯云 CloudBase 生产级 Dockerfile
# ============================================================
FROM node:18-alpine

WORKDIR /app

# 设置生产环境变量
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

# 优先拷贝依赖定义文件，利用 Docker 缓存层加速构建
COPY package*.json ./

# 安装生产依赖
RUN npm install --omit=dev --registry=https://registry.npmmirror.com && \
    npm cache clean --force

# 拷贝项目全部文件
COPY . .

# 暴露端口
EXPOSE 8080

# 启动服务
CMD ["npm", "start"]
