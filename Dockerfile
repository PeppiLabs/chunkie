# Chunkie's public live site for Railway: build with Node, serve with Caddy.
# The final image holds only the built files and the web server. No Node, no
# source, no password code.

# The base images are pinned so a new release does not change the live server's
# behaviour unreviewed. Bump them deliberately.
FROM node:22.23.3-alpine AS build
# Not /app: the visualizer also lives at app/, so Vite's two HTML entries would
# land on top of each other. /site keeps them apart.
WORKDIR /site
COPY package.json package-lock.json ./
# onnxruntime-node's install script would otherwise fetch a 205 MB GPU runtime
# on x64 that a static site never uses, and a failed download would fail the build.
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN npm ci
COPY . .
# dist/.vite holds the build manifest, which only the staging password gate
# reads, so the live site does not ship it.
RUN npm run build && rm -rf dist/.vite
# gzip siblings let Caddy serve compressed files without compressing the 23 MB
# runtime on every request.
RUN find dist -type f \( -name '*.wasm' -o -name '*.js' -o -name '*.mjs' -o -name '*.css' -o -name '*.svg' -o -name '*.json' -o -name '*.html' \) -exec gzip -9 -k {} +

FROM caddy:2.11.7-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /site/dist /srv
ENV PORT=8080
EXPOSE 8080
