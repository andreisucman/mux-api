# Use a multi-stage build to reduce the final image size
FROM node:lts-alpine AS build

WORKDIR /usr/src/app

# Copy package files and install dependencies including devDependencies
COPY package*.json ./

# Clean npm cache and install all dependencies (including dev and optional)
RUN npm cache clean --force && npm install --production=false

# Copy all source files
COPY . .

# Verify the presence of critical files (optional debug step)
RUN ls -l functions/askOpenai.* || echo "File not found"

# Build the project
RUN rm -rf dist && npm run build

# Create the production image
FROM node:lts-alpine

WORKDIR /usr/src/app

# Copy built assets from build stage
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/package*.json ./

# Set environment to production
ENV NODE_ENV=production

# Install production dependencies only
RUN npm install --production --include=optional

# Expose port and set user permissions
EXPOSE 3001
RUN chown -R node /usr/src/app

USER node
CMD ["npm", "start"]