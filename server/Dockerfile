# Use official Node.js LTS base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies with cache optimization
COPY package.json ./

RUN npm install --omit=dev
RUN apk add --no-cache curl



# Copy backend source code
COPY . .

# Set environment variables (optional fallback)
ENV PORT=3000
ENV NODE_ENV=production
ENV GOOGLE_APPLICATION_CREDENTIALS=""

# Expose backend port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
