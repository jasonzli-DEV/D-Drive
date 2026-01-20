FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Install ALL dependencies (including dev dependencies for build)
COPY package*.json ./
RUN npm install

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma client (use specific version to avoid breaking changes)
RUN npx prisma@5.8.0 generate

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create logs directory
RUN mkdir -p logs

EXPOSE 5000

CMD ["sh", "-c", "npx prisma@5.8.0 migrate deploy && npm start"]
