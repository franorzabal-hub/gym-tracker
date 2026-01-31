# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY server.ts ./
COPY src/ ./src/

RUN npx tsc

# Stage 2: Production
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/db/migrations ./dist/src/db/migrations

EXPOSE 3001
ENV PORT=3001

CMD ["node", "dist/server.js"]
