FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.base.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json

RUN npm install --workspace @uc-comms/server --workspace @uc-comms/web --include-workspace-root

COPY server ./server
COPY web ./web

ARG VITE_UC_COMMS_API_URL
ENV VITE_UC_COMMS_API_URL=$VITE_UC_COMMS_API_URL

RUN npm --workspace web run build
RUN npm --workspace server run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node
EXPOSE 3000

CMD ["node", "server/dist/index.js"]
