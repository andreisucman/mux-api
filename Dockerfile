FROM node:lts-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./

ENV NODE_ENV=development

RUN npm install --include=dev --include=optional --silent

COPY . .

RUN rm -rf dist

RUN npm run build

FROM node:lts-alpine

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/package*.json ./

ENV NODE_ENV=production
RUN npm install --include=optional --production --silent

COPY . .

ENV ALLOWED_ORIGINS=""
ENV CLIENT_URL=""
ENV SERVER_URL=""
ENV DATABASE_NAME=""

ENV GOOGLE_OAUTH_ID=""
ENV GOOGLE_OAUTH_SECRET=""
ENV GOOGLE_REDIRECT_URI=""

ENV MODEL=""
ENV MODEL_MINI=""
ENV MAX_TASKS_PER_SCHEDULE=""

ENV DATABASE_URI=""
ENV OPENAI_API_KEY=""
ENV REPLICATE_API_TOKEN=""

ENV DO_SPACES_ENDPOINT=""
ENV DO_SPACES_SECRET_KEY=""
ENV DO_SPACES_ACCESS_KEY=""
ENV DO_SPACES_BUCKET_NAME=""
ENV DO_SPACES_REGION=""

ENV SES_ACCESS_KEY=""
ENV SES_SECRET_KEY=""
ENV SES_FROM_ADDRESS=""
ENV SES_REGION=""

ENV STRIPE_PUBLIC_KEY=""
ENV STRIPE_SECRET_KEY=""
ENV STRIPE_WEBHOOK_SECRET=""

EXPOSE 3001
RUN chown -R node /usr/src/app

USER node
CMD ["npm", "start"]
