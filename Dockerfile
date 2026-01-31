# Stage 1: Build server
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY server.ts ./
COPY src/ ./src/

RUN npx tsc

# Stage 2: Build widgets
FROM node:22-slim AS widget-builder
WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN bash build.sh

# Stage 3: Production
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/db/migrations ./dist/src/db/migrations
COPY --from=widget-builder /app/web/dist ./dist/web/dist

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
