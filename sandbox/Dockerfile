FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

RUN npm install -g pnpm

WORKDIR /app

# Copy everything needed for build
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client (needed before build)
# Use linux-musl for Alpine
ENV PRISMA_BINARY_TARGET='["native", "linux-musl-openssl-3.0.x"]'
RUN cd packages/prisma-client && pnpm generate

# Build all packages and the builder app
RUN pnpm build

# Set working directory to builder
WORKDIR /app/apps/builder

# Expose port (remix-serve defaults to 3000)
EXPOSE 3000

# Run production server
CMD ["pnpm", "start"]
