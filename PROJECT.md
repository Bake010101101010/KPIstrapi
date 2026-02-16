# KPI Server

Система расчёта KPI для сотрудников по табелю рабочего времени. Загружаешь Excel-табель — получаешь расчёты, протоколы и выгрузку в 1С/бухгалтерию.

---

## Стек технологий

| Слой | Технология | Версия |
|------|-----------|--------|
| Backend | Strapi (headless CMS) | 5.33.2 |
| Database | SQLite (better-sqlite3) | default |
| Excel | ExcelJS + XLSX | 4.4 / 0.18 |
| PDF | PDFKit | 0.15 |
| Frontend | React + Vite | 18.3 / 5.0 |
| HTTP client | Axios | 1.7 |
| Language | TypeScript (backend) | 5.x |

---

## Структура папок

```
kpiServer/
├── server/          # Strapi backend, порт 12007
│   ├── config/      # Конфиги: БД, CORS, сервер, плагины
│   ├── src/
│   │   ├── api/     # Content-type API (employee, holiday, kpi-calculator, log-entry, ...)
│   │   ├── extensions/users-permissions/  # Расширение: поле allowedDepartments у User
│   │   └── index.ts # Bootstrap — настройка прав при старте
│   └── scripts/     # Миграции и сиды
│
├── frontend/        # React SPA, порт 13007
│   └── src/
│       ├── App.jsx      # Всё приложение (~1500 строк)
│       ├── api.js       # Обёртки над API-запросами
│       └── components/  # EmployeeTable.jsx
│
└── _archive_backend/  # Архив старого бэкенда
```

---

## Запуск проекта

### Dev
```bash
# Backend
cd server && npm run dev        # http://localhost:12007

# Frontend
cd frontend && npm run dev      # http://localhost:13007
```

### Build + Prod
```bash
# Backend
cd server && npm run build && npm run start

# Frontend
cd frontend && npm run build && npm run preview
```

---

## Переменные окружения

### server/.env
```env
HOST=0.0.0.0
PORT=12007
DATABASE_CLIENT=sqlite
DATABASE_FILENAME=.tmp/data.db
APP_KEYS="key1,key2"
API_TOKEN_SALT=...
ADMIN_JWT_SECRET=...
TRANSFER_TOKEN_SALT=...
JWT_SECRET=...
ENCRYPTION_KEY=...
```

### frontend/.env
```env
VITE_API_BASE=http://192.168.101.25:12007/api
# Если не задано — берёт hostname текущей страницы + :12007/api
```
