# git-sync — отдельный internal-сервис Railway (зеркалирование client → dev).
# Образ с системным git в рантайме (его не дают Railpack/Nixpacks основного портала).
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
