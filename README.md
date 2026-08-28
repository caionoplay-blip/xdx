<div align="center">
  <img width="1200" height="475" alt="XDX Mercado Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  
  <h1>🛒 XDX - Mercado</h1>
  
  <p><strong>Inteligência Computacional B2B para Gestão de Inventário e Supermercados</strong></p>
</div>

---

## 📖 Sobre o Projeto
O **XDX - Mercado** é um ecossistema avançado de reconhecimento de imagem e gestão comercial criado para supermercados. Utilizando Inteligência Artificial (Google Gemini), o XDX permite aos repositores capturar fotos de prateleiras e gôndolas para extração automática de preços, rótulos e validades, centralizando tudo em um Dashboard Administrativo em tempo real.

O sistema é construído como uma Aplicação Web Híbrida (Monolith) pronta para ser distribuída na Web (Vercel) e nos dispositivos móveis (Android via Capacitor).

## 🚀 Principais Funcionalidades
- **📸 Scan Inteligente (GenAI):** Extração de texto de gôndolas e etiquetas usando a API Gemini Vision.
- **📊 Dashboard de Bordo:** Acompanhamento de escaneamentos, inventário e precificação em tempo real.
- **☁️ Supabase Realtime:** Sincronização e armazenamento de dados em nuvem usando Postgres.
- **📱 PWA & Mobile Native:** Interface unificada web com wrap nativo Android/iOS via Capacitor.

---

## 🛠 Tecnologias Utilizadas

**Frontend:**
- [React 19](https://react.dev/) + [Vite 6](https://vitejs.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)

**Backend & IA:**
- [Supabase](https://supabase.com/) (Postgres DB)
- [@google/genai](https://ai.google.dev/) (Integração com Gemini)
- [Node.js Express](https://expressjs.com/) (Vercel Serverless)

**Mobile:**
- [Capacitor 6](https://capacitorjs.com/)
- [@capacitor-community/admob](https://github.com/capacitor-community/admob)

---

## ⚙️ Pré-requisitos
Certifique-se de ter os seguintes itens instalados no seu computador:
- **Node.js** (Versão 20 ou superior)
- **NPM** (Gerenciador de pacotes)
- **Android Studio** (Apenas se for compilar o APK/AAB)

---

## 💻 Instalação e Execução Local

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/devbtmenegali/xdx.git
   cd xdx
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configuração de Variáveis de Ambiente:**
   Crie um arquivo `.env` na raiz do projeto seguindo a estrutura do arquivo `.env.example`:
   ```env
   GEMINI_API_KEY=sua_chave_do_google_aqui
   VITE_SUPABASE_URL=url_do_seu_banco_aqui
   VITE_SUPABASE_ANON_KEY=chave_anonima_do_supabase_aqui
   ```

4. **Rode a Aplicação:**
   ```bash
   npm run dev
   ```
   > A aplicação estará disponível em `http://localhost:5173` ou na porta especificada pelo Vite/TSX.

---

## 📱 Build Mobile (Android)

Para gerar a compilação do Android, o aplicativo faz uso do Capacitor para copiar a build web para dentro da pasta `/android`.

1. **Gere a Build Web e Sincronize o Mobile:**
   ```bash
   npm run mobile:build
   ```
   *Esse comando roda `vite build` e `npx cap sync`.*

2. **Abra o Projeto no Android Studio:**
   Se preferir gerar o pacote `.aab` de forma visual:
   ```bash
   npx cap open android
   ```
   Dentro do Android Studio, vá em **Build > Generate Signed Bundle / APK...** e utilize a sua chave de produção `xdx-production.keystore`.

---

## 📁 Estrutura do Projeto

```text
/xdx-mercado
├── /android           # Código nativo do aplicativo Android (Capacitor)
├── /api               # Funções Serverless Backend (Node.js/Vercel)
├── /public            # Imagens e ícones estáticos
├── /src
│   ├── App.tsx        # Aplicação Principal React
│   ├── index.css      # Estilos Globais Tailwind
│   └── /services      # Integrações de APIs (ex: gemini.ts)
├── capacitor.config.ts# Configuração do compilador Mobile
├── package.json       # Dependências e scripts npm
├── server.ts          # Servidor Local / Handler Principal
└── README.md          # Esta documentação
```

---
<div align="center">
  <sub>Desenvolvido com dedicação por <b>devbtmenegali</b>. 🚀</sub>
</div>
