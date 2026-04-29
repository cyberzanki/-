FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw@2026.4.25

ENV NODE_ENV=production
ENV OPENCLAW_STATE_DIR=/data
ENV OPENCLAW_GATEWAY_TOKEN=q8superclaw2026
ENV PORT=10000

RUN mkdir -p /data && chown node:node /data

COPY --chown=node:node openclaw.json /data/openclaw.json

EXPOSE 10000

USER node

CMD ["openclaw", "gateway", "--allow-unconfigured", "--bind", "lan", "--port", "10000"]
