FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

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

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && npm start"]
