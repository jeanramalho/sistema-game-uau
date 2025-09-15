# Game UAU — Sistema de Ranking Trimestral

![HTML5](https://img.shields.io/badge/HTML-5-orange)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow)
![Tailwind](https://img.shields.io/badge/Tailwind-CDN-blue)
![Firebase](https://img.shields.io/badge/Firebase-RealtimeDB-red)
![Responsive](https://img.shields.io/badge/Responsive-Mobile%20First-green)

---

## 🚀 Visão Geral

**Game UAU** é uma aplicação web leve e funcional para gerenciar um sistema de ranking trimestral de jogos. Desenvolvida com foco em simplicidade, usabilidade e robustez, a aplicação combina um layout inspirado em estética retrô (8‑bit) com funcionalidades reais de administração e persistência de dados em tempo real.

O objetivo deste projeto é demonstrar capacidade de construir uma aplicação full‑frontend com integrações backend (Firebase), atenção à experiência do usuário (desktop e mobile) e padrões de código organizados.

---

## ✨ Funcionalidades Principais

- **Tela pública (Início & Ranking)**  
  - Visualização do ranking atual (top N) e um resumo top‑5 na página inicial.
  - Download de imagem do ranking com logo e layout identico à interface.
  - Atualização em tempo real quando há um trimestre (game) ativo.

- **Área Administrativa (protected)**  
  - Login via Firebase Authentication (email/senha).
  - Dashboard com ações rápidas: criar/encerrar trimestre, lançar pontos, gerenciar jogadores, exibir ranking anual e configurações.
  - Modal para criação de novos trimestres (seleção de data inicial e final).
  - Fluxo de lançamento de pontos por data (sábados): seleção do sábado, edição dos pontos por jogador, salvar/editar valores.
  - Cadastro de jogadores (usuário normal) e criação de administradores (com email e senha no Auth).
  - Edição e exclusão de jogadores.
  - Estatísticas do jogo (maior pontuação, média, sábados jogados, próximo jogo).

- **Regras de exibição e segurança UX**  
  - Rankings exibidos somente quando há um trimestre ativo. Caso contrário, mensagem informativa.
  - Modais centralizados na tela (desktop e mobile).
  - Datas exibidas no formato brasileiro `dd-mm-aaaa`.
  - Botão Login/Sair sincronizado entre páginas e menu mobile.

---

## 🛠️ Stack Tecnológica

- **Frontend:** HTML5, CSS (arquivo `css/styles.css`), JavaScript (módulos ES6), Tailwind (via CDN)  
- **Backend / Persistência:** Firebase Realtime Database + Firebase Authentication  
- **Utilitários:** html2canvas (para gerar a imagem do ranking)
- **Estrutura de arquivos (resumida):**
```
/ (raiz)
├── index.html
├── admin.html
├── login.html
├── css/
│   └── styles.css
├── js/
│   ├── firebase.js       # inicializa Firebase (configurar com credenciais)
│   ├── common.js         # funções compartilhadas
│   ├── home.js           # lógica da home / ranking (hash routing)
│   ├── admin.js          # lógica do dashboard administrativo
│   ├── print.js          # geração de imagem do ranking
│   ├── header.js         # comportamento do header e menu mobile
│   └── responsive.js     # ajustes responsivos auxiliares (mobile)
└── README_Game_UAU.md
```

---

## 🧭 Arquitetura & Organização

O projeto é organizado por responsabilidade (scripts por área funcional). A separação de preocupações facilita manutenção e testes:

- `firebase.js` centraliza a configuração e exporta instâncias do Auth e Database.
- `home.js` atua como um *router* leve (hash) para trocar entre views (início / ranking).
- `admin.js` concentra toda a lógica administrativa (modais, CRUD, lançamento de pontos).
- `common.js` contém utilitários reutilizáveis (formatadores de data, helpers de DOM).
- `header.js` e `responsive.js` cuidam apenas da camada de apresentação/responsividade.

---

## ⚙️ Como rodar (local)

1. **Clone o repositório**
```bash
git clone <seu-repo-url>
cd <seu-projeto>
```

2. **Configurar Firebase**  
   - No console do Firebase, crie um projeto, ative **Realtime Database** (modo de teste inicialmente) e **Authentication** (Email/Password).  
   - Substitua as credenciais no arquivo `js/firebase.js` com seu `firebaseConfig`.

3. **Servir os arquivos (recomendado usar um servidor local simples)**  
   - Com Python 3:
```bash
python -m http.server 8000
# ou
python3 -m http.server 8000
```
   - Abra `http://localhost:8000` no navegador.

4. **Regras mínimas do Realtime Database (desenvolvimento)**  
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```
> Em produção, ajuste regras para restringir operações administrativas.

---

## 💡 Notas Técnicas e Considerações

- **Design responsivo:** o aplicativo prioriza mobile. O header tem menu hambúrguer com painel lateral que replica links e o botão de autenticação. Componentes de input e botões se adaptam com CSS e classes utilitárias.
- **Modais centralizados:** todos os modais abrem centralizados e são acessíveis em teclas (ESC para fechar).
- **Tratamento de datas:** o sistema trabalha internamente com objetos `Date` em ISO, mas exibe `dd-mm-aaaa` para o usuário.
- **Persistência de jogadores:** jogadores são mantidos independentemente de existir um trimestre ativo; os pontos são lançados apenas enquanto houver um trimestre em andamento.
- **Impressão/download do ranking:** a imagem gerada inclui a logo/título e o layout do ranking exatamente como exibido no site (útil para relatórios/entrega).

---

## 📞 Contato

Se quiser ver este projeto em ação, discutir partes do código ou oportunidades profissionais:

- LinkedIn: https://www.linkedin.com/in/jean-ramalho/
- Email: jeanramalho.dev@gmail.com

---

**Licença:** MIT

---

⭐️ Desenvolvido por Jean Ramalho | Desenvolvedor |

---
