FROM node:20-alpine

# Install openssl for prisma engine compatibility
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

RUN npm run build

EXPOSE 3000

# Push prisma schema updates first, then start the server using ts-node
CMD ["sh", "-c", "npx prisma db push && npx ts-node -r tsconfig-paths/register src/index.ts"]
