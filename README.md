# 🚀 API MONITOR - Dashboard de Performance em Tempo Real

O **API MONITOR** é uma solução completa para monitoramento de latência e disponibilidade de APIs de Inteligência Artificial (Groq, OpenAI, Gemini, etc.). O projeto oferece uma visão clara da saúde das conexões, consumo de tokens e histórico de performance, com persistência de dados e exportação de relatórios profissionais.

---

## 🛠️ Tecnologias Utilizadas

### **Frontend:**
* **HTML5 & CSS3:** Design responsivo com foco em experiência do usuário (Mobile First).
* **JavaScript (ES6+):** Lógica de interface e consumo de APIs.
* **Chart.js:** Visualização de dados de latência em tempo real.
* **jsPDF & AutoTable:** Geração de relatórios profissionais em PDF.
* **FontAwesome:** Iconografia intuitiva.

### **Backend:**
* **Node.js & Express:** Servidor robusto para gestão de requisições.
* **PostgreSQL (Supabase):** Banco de dados relacional para persistência de logs e configurações.
* **JWT (JSON Web Token):** Autenticação segura de usuários.
* **Dotenv:** Gestão de variáveis de ambiente e segurança de chaves.

---

## ✨ Funcionalidades Principais

* **Multi-Slot Monitoring:** Gerenciamento de até 4 slots de API simultâneos.
* **Visualização de Dados:** Medidores de latência (Gauges) e gráficos de linha históricos.
* **Gestão de Consumo:** Acompanhamento de acúmulo de tokens e limites de uso.
* **Exportação de Dados:** Relatórios em CSV (análise técnica) e PDF (apresentação executiva).
* **Persistência Real:** Os dados não se perdem ao dar F5; tudo é recuperado do Supabase.
* **Segurança:** Rotas protegidas e criptografia simples para chaves de API.
* **Estratégia Anti-Sleep:** Implementação de *heartbeat* para manter instâncias gratuitas (Render/Supabase) sempre ativas.

---

## 🚀 Como Executar o Projeto

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/seu-usuario/api-monitor.git](https://github.com/seu-usuario/api-monitor.git)
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as variáveis de ambiente:**
    Crie um arquivo `.env` na raiz e adicione:
    ```env
    DATABASE_URL=sua_url_do_supabase
    JWT_SECRET=sua_chave_secreta
    ```

4.  **Inicie o servidor:**
    ```bash
    npm start
    ```

---

## 📈 Evolução Técnica
Este projeto marca minha transição de carreira para o desenvolvimento, aplicando conceitos avançados de **Fullstack Development**, integração de banco de dados e políticas de retenção de dados (limpeza automática a cada 60 dias).

---

## 👤 Autor
**Bruno Ferreira Salustiano**
* 📍 Campinas, SP - Brasil
* 🎯 Foco: JavaScript | TypeScript | Web Development
