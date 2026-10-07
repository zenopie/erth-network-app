# Build stage. Node 24 (Krypton, active LTS), pinned by digest so a rebuild of
# the same commit uses the same toolchain. To move: resolve the new tag's
# index digest (docker buildx imagetools inspect node:<tag>) and replace both.
FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# The App Link / universal link files must ship (public/.well-known is copied
# by vite as-is); fail the image rather than deploy without them.
RUN test -s build/.well-known/assetlinks.json && test -s build/.well-known/apple-app-site-association

# Production stage: nginx 1.31.6 (the nginx:alpine tag as of 2026-10-03),
# pinned by digest so a rebuild cannot ship a different server.
FROM nginx:1.31.6-alpine3.24@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2

# Copy built app from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration. security-headers.conf is included by every location
# block in nginx.conf — without it nginx fails to start rather than serving
# unprotected, which is the right way round.
COPY nginx.conf /etc/nginx/nginx.conf
COPY security-headers.conf /etc/nginx/security-headers.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]