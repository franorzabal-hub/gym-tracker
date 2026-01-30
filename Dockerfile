FROM node:22-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY server.ts ./
COPY src/ ./src/

# Run with tsx (no build step needed for server)
RUN npm install tsx

EXPOSE 3001
ENV PORT=3001

CMD ["npx", "tsx", "server.ts"]
