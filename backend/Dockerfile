FROM node:20-alpine

WORKDIR /app

# Install ALL dependencies (including dev dependencies for build)
COPY package*.json ./
RUN npm install

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create logs directory
RUN mkdir -p logs

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
