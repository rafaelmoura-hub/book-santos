FROM node:24.21.0-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node assets ./assets
COPY --chown=node:node adm ./adm
COPY --chown=node:node cliente ./cliente
COPY --chown=node:node hotel ./hotel
COPY --chown=node:node login.html login.css login.js ./
USER node
EXPOSE 3000
CMD ["node", "server/start.js"]
