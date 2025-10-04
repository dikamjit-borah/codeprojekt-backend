
FROM node:22-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=prod

# Start the application
CMD ["npm", "run", "prod"]
