FROM node:lts-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm cache clean --force && npm install --include=dev --include=optional

COPY . .

RUN rm -rf dist && npm run build

FROM node:lts-alpine

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/package*.json ./

ENV NODE_ENV=production

RUN npm install --include=optional --production

EXPOSE 3001
RUN chown -R node /usr/src/app

USER node
CMD ["npm", "start"]