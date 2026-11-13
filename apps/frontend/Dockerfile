# Stage 1: Dependencies & Build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm ci

COPY apps/frontend ./apps/frontend

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

ARG NEXT_PUBLIC_API_URL
RUN mkdir -p apps/frontend/public
RUN npm run build --workspace=apps/frontend

# Stage 2: Production Runner
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/frontend/package.json ./apps/frontend/package.json

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app/apps/frontend
CMD ["node", "../../node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
