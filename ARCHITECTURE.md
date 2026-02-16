# Architecture

## Схема взаимодействия

```
[Browser]
    │
    ▼
[React SPA :13007]  ──axios──▶  [Strapi API :12007]
    │                                   │
    │  localStorage: kpi_token          ▼
    │                           [SQLite .tmp/data.db]
    │
    └── uploads Excel-табель ──▶ [kpi-calculator service]
                                        │
                              ┌─────────┴──────────┐
                              ▼                    ▼
                     [timesheet-parser]    [report-generator]
                     (XLSX → данные)       (PDF протоколы)
```

---

## Модели данных

| Модель | Поля | Тип |
|--------|------|-----|
| **Employee** | fio, kpiSum, scheduleType (day/shift), department, categoryCode | collectionType |
| **Holiday** | date, year, month, description | collectionType |
| **LogEntry** | type (added/edited/deleted/restored), user, employeeId, oldData, newData, reason, timestamp | collectionType |
| **ReportSetting** | protocolNumber, commissionMembers[], meetingDateOverrides[], secretaryName, agendaText, footerText | singleType |
| **User** (расширен) | + allowedDepartments: json[] | built-in Strapi |

---

## API эндпоинты

### Аутентификация (Strapi built-in)
```
POST /api/auth/local          — логин, возвращает JWT
```

### KPI Calculator
```
POST /api/kpi-calculator/calculate          — расчёт KPI, возвращает JSON
POST /api/kpi-calculator/download-excel     — Excel-отчёт
POST /api/kpi-calculator/download-1c        — выгрузка для 1С [index, fio, kpi]
POST /api/kpi-calculator/download-buh       — отчёт для бухгалтерии (Excel)
POST /api/kpi-calculator/download-buh-pdf   — то же в PDF
POST /api/kpi-calculator/download-report    — протокол PDF
```
Параметры запроса: `year`, `month`, `nchDay`, `ndShift`, `department`, `holidays[]`, `timesheet` (file)

### CRUD (стандартные Strapi-роуты)
```
GET/POST   /api/employees
PUT/DELETE /api/employees/:id
GET/POST   /api/holidays
GET        /api/log-entries
GET/PUT    /api/report-setting
GET        /api/users             (через users-permissions plugin)
```

---

## Аутентификация

1. `POST /api/auth/local` → сервер возвращает `{ jwt, user }`
2. Токен сохраняется в `localStorage` под ключом `kpi_token`
3. Все запросы идут с заголовком `Authorization: Bearer <token>`
4. Strapi проверяет JWT на каждый запрос
5. Права для kpi-calculator эндпоинтов выдаются при старте сервера (`src/index.ts → ensureAuthenticatedPermissions`)

**Уровни доступа:**
- **Admin** — полный доступ: роль содержит "admin", username начинается с "admin" или email начинается с "admin@"
- **Пользователь** — видит только отделы из `allowedDepartments` (поле на User)

---

## Ключевые компоненты

| Файл | Назначение |
|------|-----------|
| `server/src/api/kpi-calculator/services/kpi-calculator.ts` | Логика расчёта KPI по формулам для day/shift-расписаний |
| `server/src/api/kpi-calculator/services/timesheet-parser.ts` | Парсинг Excel-табеля, классификация дней (будни/сб/вс/праздник) |
| `server/src/api/kpi-calculator/services/report-generator.ts` | Генерация PDF-протоколов |
| `server/src/extensions/users-permissions/strapi-server.ts` | Добавляет поле `allowedDepartments` к User |
| `server/src/index.ts` | Bootstrap: выдача прав authenticated-роли при старте |
| `frontend/src/App.jsx` | Весь UI: авторизация, табы, формы, таблицы |
| `frontend/src/api.js` | Обёртки axios для всех API-вызовов |
