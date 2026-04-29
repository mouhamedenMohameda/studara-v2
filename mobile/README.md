# توجيه — Tawjeeh 🎓

**منصة الطالب الجامعي الموريتاني** — The all-in-one academic companion for Mauritanian university students.

---

## Overview

Tawjeeh is a seed-stage startup product built to solve the day-to-day friction faced by students at Mauritanian universities (UNA, UPM, ISE, ISERI). The V1 ships four focused features:

| Feature | Description |
|---|---|
| 📚 **Resources** | Upload, browse, and download study materials (PDFs, slides, docs) per faculty & year |
| 📅 **Timetable** | Personal course schedule builder — offline-first with AsyncStorage |
| 🔔 **Reminders** | Smart reminders for exams, assignments and deadlines — grouped by urgency |
| 👤 **Profile** | Personal academic profile, stats, and app settings |

---

## Architecture

```
tawjeeh/
├── 📱  (Expo / React Native)        — Mobile app
├── api/                             — Express REST API
└── admin/                           — React admin dashboard
```

```
Mobile (Expo)          Backend (Express)         Admin (Vite + React)
┌─────────────┐        ┌──────────────────┐      ┌─────────────────┐
│ Onboarding  │──────▶ │  /auth           │      │ /login          │
│ Auth Stack  │        │  /resources      │◀────▶│ /               │ (dashboard)
│  • Login    │        │  /timetable      │      │ /resources      │ (moderation)
│  • Register │        │  /reminders      │      │ /users          │ (management)
│ Main Tabs   │        │  /admin          │      └─────────────────┘
│  • Resources│        └──────────────────┘
│  • Timetable│               │
│  • Reminders│        ┌──────▼──────┐
│  • Profile  │        │ PostgreSQL  │
└─────────────┘        └────────────┘
```

---

## Tech Stack

### Mobile
- **Expo SDK** ~54 · React Native 0.81.5
- **TypeScript** strict
- **@react-navigation/native** v7 — Stack + Bottom Tabs
- **@react-native-async-storage** — offline-first storage
- **@expo/vector-icons** (Ionicons)

### Backend API
- **Node.js** + **Express** + TypeScript
- **PostgreSQL** — full schema with triggers, full-text search, audit logs
- **JWT** — access tokens (15 min) + refresh tokens (30 days)
- **multer** — file uploads (PDF / DOCX / PPTX)
- **zod** — request validation
- **bcryptjs** — password hashing
- **helmet** + **cors** + **express-rate-limit** — security

### Admin Dashboard
- **React 18** + **Vite 5** + **TypeScript**
- **Tailwind CSS 3** — utility-first styling
- **react-router-dom v6** — client-side routing

---

## Project Structure

```
tawjeeh/
│
├── App.tsx
├── src/
│   ├── context/
│   │   └── AuthContext.tsx        # Auth + onboarding state
│   ├── navigation/
│   │   ├── AppNavigator.tsx       # Root flow (Onboarding → Auth → Main)
│   │   ├── AuthNavigator.tsx      # Login / Register stack
│   │   └── MainNavigator.tsx      # 4-tab bottom navigator
│   ├── screens/
│   │   ├── Auth/
│   │   │   ├── OnboardingScreen.tsx
│   │   │   ├── LoginScreen.tsx
│   │   │   └── RegisterScreen.tsx
│   │   ├── Resources/
│   │   │   ├── ResourcesScreen.tsx
│   │   │   ├── ResourceDetailScreen.tsx
│   │   │   └── UploadResourceScreen.tsx
│   │   ├── Timetable/
│   │   │   └── TimetableScreen.tsx
│   │   ├── Reminders/
│   │   │   └── RemindersScreen.tsx
│   │   └── Profile/
│   │       └── ProfileScreen.tsx
│   ├── components/common/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Badge.tsx
│   │   └── EmptyState.tsx
│   ├── theme/
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   └── index.ts
│   ├── constants/index.ts
│   └── types/index.ts
│
├── api/
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.sql         # Full PostgreSQL schema
│   │   │   ├── seed.sql           # Admin + demo data
│   │   │   └── pool.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts            # JWT verify + role guard
│   │   │   └── upload.ts          # multer config
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── resources.ts
│   │   │   ├── timetable.ts
│   │   │   ├── reminders.ts
│   │   │   └── admin.ts
│   │   └── index.ts               # Express entry point
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
└── admin/
    ├── src/
    │   ├── api/client.ts          # Typed fetch wrapper
    │   ├── components/
    │   │   └── Layout.tsx         # Sidebar + header shell
    │   ├── pages/
    │   │   ├── LoginPage.tsx
    │   │   ├── DashboardPage.tsx
    │   │   ├── ResourcesPage.tsx  # Approve / reject queue
    │   │   └── UsersPage.tsx      # User management
    │   ├── App.tsx
    │   ├── main.tsx
    │   └── index.css
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.js
    └── vite.config.ts
```

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- PostgreSQL ≥ 14
- Expo CLI (`npm install -g expo-cli`)

---

### 1 · Database

```bash
psql -U postgres
CREATE DATABASE tawjeeh;
\c tawjeeh
\i api/src/db/schema.sql
\i api/src/db/seed.sql
```

---

### 2 · Backend API

```bash
cd api
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
npm install
npm run dev
# API running at http://localhost:3000
```

`.env` minimum:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/tawjeeh
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
```

---

### 3 · Admin Dashboard

```bash
cd admin
npm install
npm run dev
# Dashboard at http://localhost:5173
```

Default credentials (seeded):
```
Email:    admin@tawjeeh.mr
Password: Admin@2025!
```

---

### 4 · Mobile App

```bash
# from project root
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (iOS / Android).

---

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create student account |
| POST | `/api/auth/login` | — | Login → access + refresh tokens |
| POST | `/api/auth/refresh` | — | Rotate refresh token |
| GET | `/api/auth/me` | ✅ | Current user profile |

### Resources
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/resources` | — | List approved resources (filter: faculty, type, year, search) |
| GET | `/api/resources/:id` | — | Get single resource (increments download count) |
| POST | `/api/resources` | ✅ | Upload new resource (multipart/form-data) |
| POST | `/api/resources/:id/like` | ✅ | Toggle like |
| POST | `/api/resources/:id/bookmark` | ✅ | Toggle bookmark |

### Timetable
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/timetable` | ✅ | User's timetable entries |
| POST | `/api/timetable` | ✅ | Add entry |
| PUT | `/api/timetable/:id` | ✅ | Update entry |
| DELETE | `/api/timetable/:id` | ✅ | Delete entry |

### Reminders
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/reminders` | ✅ | User's reminders |
| POST | `/api/reminders` | ✅ | Create reminder |
| PUT | `/api/reminders/:id` | ✅ | Update / toggle complete |
| DELETE | `/api/reminders/:id` | ✅ | Delete reminder |

### Admin (requires admin or moderator role)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/stats` | Platform statistics |
| GET | `/api/admin/resources` | Paginated resources list with status filter |
| PUT | `/api/admin/resources/:id/moderate` | Approve or reject a resource |
| GET | `/api/admin/users` | Search users |
| PUT | `/api/admin/users/:id/ban` | Ban or unban a user |
| PUT | `/api/admin/users/:id/verify` | Verify a user account |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | Access token signing key |
| `JWT_REFRESH_SECRET` | — | Refresh token signing key |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token lifetime |
| `PORT` | `3000` | API server port |
| `MAX_FILE_SIZE_MB` | `20` | Upload size limit |
| `ADMIN_EMAIL` | — | Seed admin email |
| `ADMIN_PASSWORD` | — | Seed admin password |

---

## Modifier un fichier `.env` sur le serveur (VPS)

### 1) Se connecter en SSH

```bash
ssh root@5.189.153.144
```

### 2) Éditer le fichier `.env` utilisé par l’API

Sur le serveur Studara, l’API est généralement déployée dans:

```bash
cd /var/www/studara/api
sudo nano .env
```

Exemple (clé dédiée au “Résumé intelligent de cours”):

```env
SUMARRY_OPENAI_API_KEY=sk-...
```

### 3) Recharger l’API (PM2) pour prendre en compte les variables

```bash
pm2 reload studara-api --update-env
pm2 status
```

### 4) Vérifier rapidement

```bash
curl -i http://127.0.0.1:3000/health
curl -i http://5.189.153.144/health
```

---

## Déployer des changements sur le VPS (via `backend/deploy/deploy.sh`)

### 0) Prérequis

- Accès SSH au VPS (idéalement **clé SSH**).
- Le fichier `.env` existe déjà côté serveur: `/var/www/studara/api/.env`
- PM2 est installé et l’app s’appelle **`studara-api`** (cf. `pm2 ls`).

### 1) Lancer le déploiement depuis ton PC

Depuis le dossier `backend`:

```bash
cd backend
bash deploy/deploy.sh
```

Ce script fait:
- build TypeScript en local
- copie le code sur le serveur dans `/var/www/studara/api`
- applique toutes les migrations SQL dans `src/db/migrations/`
- reload PM2 (`pm2 reload studara-api --update-env`)

### 2) Vérifier côté serveur (après déploiement)

```bash
ssh root@5.189.153.144
pm2 ls
curl -i http://127.0.0.1:3000/health
```

### 3) Dépannage rapide

- Si une migration échoue: vérifier `DATABASE_URL` dans `/var/www/studara/api/.env`
- Si l’API ne redémarre pas: `pm2 logs studara-api --lines 200`
- Si Nginx répond 404: vérifier la conf dans `/etc/nginx/sites-available/tawjeeh` puis `sudo nginx -t && sudo systemctl reload nginx`

> Sécurité: évite de partager des mots de passe/keys dans le chat ou dans Git. Utilise des clés SSH et change tout secret exposé.

### 4) Exécuter une migration SQL Postgres à la main (exemple : `040_ai_exercise_document_metrics_wallet.sql`)

Le script `backend/deploy/deploy.sh` applique normalement **toutes** les migrations du dossier `backend/src/db/migrations/`. Si tu dois appliquer **une seule** migration (nouvelle base, rollback partiel, ou correctif avant le prochain déploiement), tu peux lancer le fichier SQL directement avec `psql`.

1. Va dans le dépôt **backend** (`backend`), pas le dossier mobile.
2. Assure-toi d’avoir l’URL de connexion Postgres (souvent la même que `DATABASE_URL` dans `.env` de l’API).

**En local ou depuis ta machine** (recommandé si `DATABASE_URL` est exportée) :

```bash
cd /chemin/vers/backend
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/040_ai_exercise_document_metrics_wallet.sql
```

**Sur le VPS** (après `ssh`, si tu n’utilises pas la variable d’environnement) :

```bash
cd /var/www/studara/api
# Charge les variables du .env puis exécute la migration
set -a && source .env && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/040_ai_exercise_document_metrics_wallet.sql
```

**Sans `DATABASE_URL`** (paramètres explicites) :

```bash
psql -h HOST -p 5432 -U UTILISATEUR -d NOM_BASE -v ON_ERROR_STOP=1 -f src/db/migrations/040_ai_exercise_document_metrics_wallet.sql
```

- `-v ON_ERROR_STOP=1` : arrête au premier erreur SQL.
- Après succès : redémarre l’API si besoin (`pm2 reload studara-api`) pour que les nouvelles colonnes / la clé `ai_exercise_correction` dans `premium_features` soient bien utilisées par le code déjà déployé.

Pour une **autre** migration, remplace uniquement le nom du fichier `.sql` dans la commande `-f`.

---

## Roadmap

### V1 (Current)
- [x] Resources library with moderation
- [x] Personal timetable (offline-first)
- [x] Smart reminders with urgency grouping
- [x] User profile + settings
- [x] Onboarding flow
- [x] Admin dashboard (approve/reject, user management)

### V2
- [ ] Push notifications (Expo Notifications)
- [ ] Real file upload on device (Expo DocumentPicker)
- [ ] Resource search with full-text (PostgreSQL tsvector)
- [ ] Resource previews (PDF.js in WebView)
- [ ] Arabic/French language toggle (i18n)
- [ ] University verification via .mr student email

### V3
- [ ] Study groups (real-time chat via Socket.io)
- [ ] Smart timetable import (OCR photo-to-schedule)
- [ ] Peer tutoring marketplace
- [ ] Exam results push notifications

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please follow the existing code style and ensure TypeScript strict mode passes before opening a PR.

---

## License

MIT © 2025 Tawjeeh — توجيه

---

<div align="center">
  Made with ❤️ for Mauritanian students
</div>
