# Usa a versão estável do Node
FROM node:20

# Cria a pasta do app no servidor
WORKDIR /usr/src/app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as bibliotecas (node_modules) lá no servidor
RUN npm install

# Copia o resto dos arquivos do seu motor
COPY . .

# Expõe a porta que o servidor vai usar
EXPOSE 8080

# Comando para ligar o motor
CMD ["node", "server.js"]