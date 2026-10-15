# Chunkie's public live site for Railway: build with Node, serve with Caddy.
# The final image holds only the built files and the web server. No Node, no
# source, no password code.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# dist/.vite holds the build manifest, which only the staging password gate
# reads, so the live site does not ship it.
RUN npm run build && rm -rf dist/.vite

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
ENV PORT=8080
EXPOSE 8080
