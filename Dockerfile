# NestLife 私有部署 — Docker 镜像
# 构建：docker build -t nestlife .
# 运行：见 docker-compose.yml
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NESTLIFE_DATA=/data
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/scripts ./scripts
EXPOSE 3100
VOLUME ["/data"]
CMD ["npm", "run", "start", "--", "-p", "3100"]
