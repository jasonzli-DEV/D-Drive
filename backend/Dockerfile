FROM node:20-alpine

# Install OpenSSL for Prisma and tini for proper process management
RUN apk add --no-cache openssl tini

WORKDIR /app

# Install ALL dependencies (including dev dependencies for build)
COPY package*.json ./
RUN npm install

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma client using installed version
RUN ./node_modules/.bin/prisma generate

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create logs directory
RUN mkdir -p logs

EXPOSE 5000

# Use tini as init to properly reap zombie processes
ENTRYPOINT ["/sbin/tini", "--"]

# Run prisma migrate then start with node directly (not npm) to avoid zombie processes
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/index.js"]
