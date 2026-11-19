# SynapseBox en Docker. Node 22 incluye node:sqlite, así que no hace falta compilar nada.
FROM node:22-bookworm-slim

# git: para subir plugins al repositorio desde el panel. LibreOffice (opcional, pesado): vista previa de documentos de Office.
#   docker build --build-arg INSTALL_LIBREOFFICE=1 -t synapsebox .
ARG INSTALL_LIBREOFFICE=0
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tini \
 && if [ "$INSTALL_LIBREOFFICE" = "1" ]; then apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress; fi \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .

# data/ = base de datos, ajustes y plugins · hosting/ = archivos de los usuarios · /disks = discos extra (se añaden desde Admin → Almacenamiento)
RUN mkdir -p /app/data /app/hosting /disks && chown -R node:node /app /disks
USER node

ENV NODE_ENV=production PORT=3001 TRUST_PROXY=1
EXPOSE 3001
VOLUME ["/app/data", "/app/hosting", "/disks"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini recoge señales (docker stop = cierre ordenado)
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
