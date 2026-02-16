# Conventions

## Именование

| Что | Стиль | Пример |
|-----|-------|--------|
| Файлы компонентов | PascalCase | `EmployeeTable.jsx` |
| Файлы утилит/API | camelCase | `api.js`, `timesheet-parser.ts` |
| Strapi content-type папки | kebab-case | `kpi-calculator/`, `log-entry/` |
| Функции API-обёрток | `api` + Action | `apiLogin`, `apiDeleteEmployee` |
| Переменные/функции | camelCase | `scheduleType`, `workedDaysTotal` |
| Enum-значения | строчные | `"day"`, `"shift"`, `"added"`, `"deleted"` |
| Strapi API slug | kebab-case | `api::kpi-calculator.kpi-calculator` |

---

## Структура Strapi API-модуля

Каждый модуль в `server/src/api/` содержит:
```
module-name/
├── content-types/module-name/schema.json   # Схема модели
├── controllers/module-name.ts              # HTTP-обработчики
├── routes/module-name.ts                   # Маршруты
└── services/module-name.ts                 # Бизнес-логика
```
Контроллеры тонкие — логика в сервисах.

---

## Структура фронтенд-компонентов

- Всё приложение в `App.jsx` (монолит): состояние через `useState`, запросы через `api.js`
- Выделенный компонент создаётся только если используется повторно (`EmployeeTable.jsx`)
- Нет роутера — переключение вкладок через `activeTab` state
- Нет глобального стейт-менеджера — всё local state + пробрасывание пропсов

---

## Обработка ошибок

**Backend:**
- Strapi-ошибки пробрасываются через стандартный `ctx.throw()` / `ctx.badRequest()`
- В kpi-calculator: ошибки парсинга и расчёта возвращаются в теле ответа как `{ errors: [] }`

**Frontend (`api.js`):**
- Каждая функция — async, оборачивает axios-вызов в try/catch
- `401 Unauthorized` → удаляет токен из localStorage
- Ошибки возвращаются через `throw` с читаемым сообщением

---

## Используемые паттерны

**Bootstrap-инициализация прав** (`src/index.ts`):
При старте сервера программно выдаёт права роли `authenticated` на все kpi-calculator эндпоинты. Так права не теряются при сбросе БД.

**Расширение built-in плагина** (`extensions/users-permissions/`):
Strapi-паттерн: переопределяем `strapi-server` плагина, чтобы добавить своё поле (`allowedDepartments`) к модели User без форка.

**Мягкое удаление сотрудников:**
Сотрудники не удаляются физически — помечаются как удалённые. Восстановление через `apiRestoreEmployee`. Все операции логируются в `log-entry`.

**Department-based access:**
Пользователь видит только сотрудников своих отделов (`allowedDepartments`). Фильтрация на стороне сервера внутри kpi-calculator контроллера.

**Формат выгрузки под 1С:**
Фиксированный порядок колонок `[index, fio, kpi]` без заголовков — договорённость с бухгалтерией, не менять.
