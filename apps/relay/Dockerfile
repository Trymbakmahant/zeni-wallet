FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node src ./src
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "src/server.mjs"]
