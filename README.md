\# PeloCaramelo



Plataforma web para conectar \*\*tutores de animais de estimação\*\* a \*\*cuidadores\*\*, com foco em experiência simples de busca, pré-reserva, comunicação e gestão de reservas.



\## Visão geral



O \*\*PeloCaramelo\*\* permite que tutores encontrem cuidadores por disponibilidade/serviço, enviem \*\*pré-reservas\*\* e conversem via \*\*chat\*\* dentro da plataforma. O projeto está organizado em duas camadas:



\- \*\*frontend/\*\*: aplicação web (UI/UX)

\- \*\*backend/\*\*: API REST + regras de negócio + integração com banco de dados (PostgreSQL)



\## Stack



\### Frontend

\- React + Vite

\- React Router

\- Consumo de API via `fetch`/requests autenticadas (token)



\### Backend

\- Node.js + Express

\- PostgreSQL (conexão via `pg`)

\- Autenticação por token (JWT)



\### Deploy (planejado/recomendado)

\- Frontend: Vercel

\- Backend: Render

\- Banco: Supabase (PostgreSQL)



\## Funcionalidades (alto nível)



\- Autenticação (login)

\- Busca/visualização de cuidadores

\- Disponibilidade por datas (calendário)

\- Pré-reserva e fluxo de reserva

\- Chat entre tutor e cuidador (dentro do app)

\- Avaliações (reviews) com opção de ocultar/exibir (admin/moderação)

\- Painéis (Tutor / Cuidador / Admin)



\## Estrutura do repositório





