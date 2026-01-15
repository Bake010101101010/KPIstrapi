import React, { useEffect, useState } from "react";
import {
  apiLogin,
  apiMe,
  apiCalcKpiJson,
  apiCalcKpiExcel,
  apiKpiList,
  apiDeletedLog,
  apiEditedLog,
  apiRestoredLog,
  apiAddEmployee,
  apiEditEmployee,
  apiDeleteEmployee,
  apiRestoreEmployee,
  apiHolidays,
  apiAddHoliday,
  apiDeleteHoliday,
} from "./api";

// ======================= Toast (по центру) =======================

function Toast({ message, onClose }) {
  if (!message) return null;

  const bg =
    message.type === "error"
      ? "rgba(248,113,113,0.95)" // красный
      : "rgba(52,211,153,0.95)"; // зелёный

  return (
    <div className="toast-overlay" onClick={onClose}>
      <div
        className="toast-popup"
        style={{ backgroundColor: bg }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="toast-text">{message.text}</div>
        <button className="toast-btn" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

// ======================= Модалка подтверждения удаления =======================

function DeleteConfirmModal({ employee, onCancel, onConfirm }) {
  const [reason, setReason] = useState("Уволился");

  useEffect(() => {
    setReason("Уволился");
  }, [employee]);

  if (!employee) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Удаление сотрудника</h3>
        <p className="modal-text">
          Вы действительно хотите удалить сотрудника{" "}
          <strong>{employee.fio}</strong> из справочника KPI?
        </p>
        <p className="modal-subtext">
          Укажите причину удаления — она будет записана в отдельный Excel-лог.
        </p>
        <label className="modal-label">
          Причина:
          <select
            className="modal-select"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="Уволился">Уволился</option>
            <option value="Добавлен ошибочно">Добавлен ошибочно</option>
            <option value="Переведён в другое отделение">
              Переведён в другое отделение
            </option>
            <option value="Другое">Другое</option>
          </select>
        </label>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Отмена
          </button>
          <button
            className="btn btn-danger"
            onClick={() => onConfirm(employee, reason)}
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

// ======================= Форма добавления / редактирования =======================

function EmployeeFormModal({ initial, mode, onCancel, onSave }) {
  const [fio, setFio] = useState(initial?.fio || "");
  const [kpiSum, setKpiSum] = useState(initial?.kpiSum || 11000);
  const [scheduleType, setScheduleType] = useState(
    initial?.scheduleType || "day"
  );
  const [department, setDepartment] = useState(initial?.department || "");
  const [categoryCode, setCategoryCode] = useState(
    initial?.categoryCode || ""
  );

  useEffect(() => {
    if (!initial) return;
    setFio(initial.fio || "");
    setKpiSum(initial.kpiSum || 11000);
    setScheduleType(initial.scheduleType || "day");
    setDepartment(initial.department || "");
    setCategoryCode(initial.categoryCode || "");
  }, [initial]);

  if (!mode) return null;

  const isEdit = mode === "edit";

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      id: initial?.id,
      fio: fio.trim(),
      kpiSum: Number(kpiSum),
      scheduleType,
      department: department.trim(),
      categoryCode: categoryCode.trim(),
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">
          {isEdit ? "Редактирование сотрудника" : "Добавление сотрудника"}
        </h3>
        <p className="modal-subtext">
          Укажите ФИО строго так же, как в удостоверении личности или в 1С.
        </p>
        <form onSubmit={handleSubmit} className="employee-form">
          <label className="modal-label">
            ФИО *
            <input
              className="modal-input"
              value={fio}
              onChange={(e) => setFio(e.target.value)}
              placeholder="Фамилия Имя Отчество"
              required
            />
          </label>

          <label className="modal-label">
            KPI сумм (тенге) *
            <input
              type="number"
              min={0}
              step={100}
              className="modal-input"
              value={kpiSum}
              onChange={(e) => setKpiSum(e.target.value)}
              required
            />
          </label>

          <label className="modal-label">
            График *
            <select
              className="modal-select"
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value)}
              required
            >
              <option value="day">Дневной</option>
              <option value="shift">Суточный</option>
            </select>
          </label>

          <label className="modal-label">
            Отделение *
            <input
              className="modal-input"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Например, ОЦМК-2"
              required
            />
          </label>

          <label className="modal-label">
            Категория (код)
            <input
              className="modal-input"
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
              placeholder="Необязательно"
            />
          </label>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
            >
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">
              {isEdit ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ======================= Основное приложение =======================

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);

  const [loginForm, setLoginForm] = useState({
    login: "",
    password: "",
  });

  const [activeTab, setActiveTab] = useState("calc");
  const [toast, setToast] = useState(null);

  // --- состояние формы расчёта KPI по табелю ---
  const [timesheetFile, setTimesheetFile] = useState(null);
  const [nchDay, setNchDay] = useState("21");
  const [ndShift, setNdShift] = useState("25");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [holidayDate, setHolidayDate] = useState("");
  const [holidays, setHolidays] = useState([]); // Массив объектов {id, date}
  const [calcResults, setCalcResults] = useState([]);
  const [calcErrors, setCalcErrors] = useState([]);

  // --- состояние справочника KPI ---
  const [kpiItems, setKpiItems] = useState([]);
  const [deletedItems, setDeletedItems] = useState([]);
  const [editedItems, setEditedItems] = useState([]);
  const [restoredItems, setRestoredItems] = useState([]);

  const [kpiTab, setKpiTab] = useState("list"); // list | deleted | history
  const [filterSchedule, setFilterSchedule] = useState("all"); // all | day | shift
  const [filterDept, setFilterDept] = useState("");
  const [searchFio, setSearchFio] = useState("");
  const [sortBy, setSortBy] = useState("fio"); // fio | id

  const [deleteModalEmployee, setDeleteModalEmployee] = useState(null);
  const [formMode, setFormMode] = useState(null); // "add" | "edit"
  const [formInitial, setFormInitial] = useState(null);

  const formatChange = (oldVal, newVal) => {
    const oldStr =
      oldVal === undefined || oldVal === null ? "" : String(oldVal);
    const newStr =
      newVal === undefined || newVal === null ? "" : String(newVal);
    if (!oldStr && !newStr) return "";
    if (oldStr === newStr) return oldStr;
    return `${oldStr || "—"} → ${newStr || "—"}`;
  };

  const normalizeCalcError = (item) => {
    if (!item) {
      return { fio: "", type: "", message: "Неизвестная ошибка" };
    }
    if (typeof item === "string") {
      return { fio: "", type: "", message: item };
    }
    if (typeof item === "object") {
      const fio = item.fio ? String(item.fio) : "";
      const type = item.type ? String(item.type) : "";
      const message =
        item.details ||
        item.message ||
        item.error ||
        (typeof item.info === "string" ? item.info : "");
      if (message) {
        return { fio, type, message: String(message) };
      }
      try {
        return { fio, type, message: JSON.stringify(item) };
      } catch (err) {
        return { fio, type, message: String(item) };
      }
    }
    return { fio: "", type: "", message: String(item) };
  };

  const calcIssues = (calcErrors || []).map(normalizeCalcError);

  useEffect(() => {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m) return;

    apiHolidays(y, m)
      .then((holidayList) => {
        setHolidays(holidayList || []);
      })
      .catch((e) => {
        console.error("Ошибка загрузки праздников из Strapi", e);
        setHolidays([]);
      });
  }, [year, month]);

  // =================== Авторизация ===================

  useEffect(() => {
    // пробуем восстановить сессию
    const token = localStorage.getItem("kpi_token");
    if (!token) {
      setAuthChecked(true);
      return;
    }
    apiMe()
      .then((data) => {
        setUser({ login: data.login, role: data.role });
      })
      .catch(() => {
        localStorage.removeItem("kpi_token");
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const showToast = (text, type = "success") => {
    setToast({ text, type });
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await apiLogin(loginForm.login, loginForm.password);
      localStorage.setItem("kpi_token", data.token);
      setUser({ login: data.login, role: data.role });
      showToast("Успешный вход в систему");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(errorMsg || "Ошибка авторизации", "error");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("kpi_token");
    setUser(null);
    setKpiItems([]);
    setDeletedItems([]);
    setEditedItems([]);
    setRestoredItems([]);
  };

  // =================== Загрузка справочника KPI ===================

  const reloadKpiAll = async () => {
    try {
      const [listRes, delRes, editRes, restRes] = await Promise.all([
        apiKpiList(),
        apiDeletedLog(),
        apiEditedLog(),
        apiRestoredLog(),
      ]);
      setKpiItems(listRes.items || listRes || []);
      setDeletedItems(delRes.items || delRes || []);
      setEditedItems(editRes.items || editRes || []);
      setRestoredItems(restRes.items || restRes || []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(errorMsg || "Ошибка загрузки справочника KPI", "error");
    }
  };

  useEffect(() => {
    if (user) {
      reloadKpiAll();
    }
  }, [user]);

  // =================== Расчёт KPI по табелю ===================

  const handleCalc = async () => {
    if (!timesheetFile) {
      showToast("Пожалуйста, выберите файл табеля", "error");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("timesheet", timesheetFile);
      fd.append("nchDay", nchDay || "0");
      fd.append("ndShift", ndShift || "0");
      fd.append("year", year);
      fd.append("month", month);
      // Отправляем только даты (массив строк)
      const holidayDates = holidays.map((h) => h.date || h).filter(Boolean);
      fd.append("holidays", JSON.stringify(holidayDates));

      const data = await apiCalcKpiJson(fd);
      setCalcResults(data.results || []);
      setCalcErrors(data.errors || []);
      showToast("Расчёт KPI выполнен");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(errorMsg || "Ошибка расчёта KPI", "error");
    }
  };

  const handleDownload = async (mode) => {
    if (!timesheetFile) {
      showToast("Пожалуйста, выберите файл табеля", "error");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("timesheet", timesheetFile);
      fd.append("nchDay", nchDay || "0");
      fd.append("ndShift", ndShift || "0");
      fd.append("year", year);
      fd.append("month", month);
      // Отправляем только даты (массив строк)
      const holidayDates = holidays.map((h) => h.date || h).filter(Boolean);
      fd.append("holidays", JSON.stringify(holidayDates));

      const blob = await apiCalcKpiExcel(fd, mode);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      if (mode === "1c") {
        a.download = `KPI_for_1C_${ts}.xlsx`;
      } else if (mode === "buh") {
        a.download = `KPI_for_Buh_${ts}.xlsx`;
      } else {
        a.download = `KPIfinal_${ts}.xlsx`;
      }
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("Файл Excel сформирован и скачан");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(errorMsg || "Ошибка формирования файла", "error");
    }
  };

  // =================== Работа со справочником KPI ===================

  const filteredKpiItems = kpiItems
    .filter((item) => {
      if (filterSchedule === "day" && item.scheduleType !== "day") return false;
      if (filterSchedule === "shift" && item.scheduleType !== "shift")
        return false;
      if (filterDept && item.department !== filterDept) return false;
      if (
        searchFio &&
        !String(item.fio || "")
          .toLowerCase()
          .includes(searchFio.toLowerCase())
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "id") {
        return (a.id || 0) - (b.id || 0);
      }
      const fa = String(a.fio || "").toLowerCase();
      const fb = String(b.fio || "").toLowerCase();
      return fa.localeCompare(fb, "ru");
    });

  const allDepartments = Array.from(
    new Set(kpiItems.map((x) => x.department || "").filter(Boolean))
  );

  const openAddForm = () => {
    setFormInitial(null);
    setFormMode("add");
  };

  const openEditForm = (item) => {
    setFormInitial(item);
    setFormMode("edit");
  };

  const handleFormSave = async (payload) => {
    // валидация
    if (!payload.fio) {
      showToast(
        "Укажите ФИО сотрудника (как в удостоверении личности или в 1С).",
        "error"
      );
      return;
    }
    if (!payload.department) {
      showToast("Укажите отделение сотрудника", "error");
      return;
    }
    if (!payload.scheduleType) {
      showToast("Укажите график работы сотрудника", "error");
      return;
    }
    if (!payload.kpiSum || Number(payload.kpiSum) <= 0) {
      showToast("Укажите KPI сумм (тенге)", "error");
      return;
    }

    try {
      if (formMode === "add") {
        await apiAddEmployee(payload);
        showToast("Сотрудник успешно добавлен");
      } else if (formMode === "edit") {
        await apiEditEmployee(payload);
        showToast("Данные сотрудника успешно обновлены");
      }
      setFormMode(null);
      setFormInitial(null);
      await reloadKpiAll();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(errorMsg || "Ошибка сохранения сотрудника", "error");
    }
  };

  const handleDeleteClick = (emp) => {
    setDeleteModalEmployee(emp);
  };

  const handleDeleteConfirm = async (emp, reason) => {
    try {
      await apiDeleteEmployee(emp.id, reason);
      setDeleteModalEmployee(null);
      showToast("Сотрудник успешно удалён");
      await reloadKpiAll();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(errorMsg || "Ошибка удаления сотрудника", "error");
    }
  };

  // восстановление из удалённых
  const handleRestore = async (row) => {
    try {
      await apiRestoreEmployee({
        fio: row.fio,
        kpiSum: row.kpiSum,
        scheduleType: row.scheduleType,
        department: row.department,
        categoryCode: row.categoryCode,
        deleted_timestamp: row.timestamp || row.deleted_timestamp,
        deleted_by: row.user || row.deleted_by,
        deleted_reason: row.reason || row.deleted_reason,
      });
      showToast("Сотрудник успешно восстановлен");
      await reloadKpiAll();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(errorMsg || "Ошибка восстановления сотрудника", "error");
    }
  };

  // =================== Рендер ===================

  if (!authChecked) {
    return <div className="page-loading">Загрузка…</div>;
  }

  if (!user) {
    // Страница логина
    return (
      <div className="page page-login">
        <div className="login-card">
          <div className="login-logo-block">
            <img src="/logo.png" alt="ННМЦ" className="login-logo" />
            <h1>ННМЦ — KPI по табелю</h1>
            <p>Авторизация для работы с расчётом KPI и справочником сотрудников</p>
          </div>
          <form className="login-form" onSubmit={handleLoginSubmit}>
            <label>
              Логин
              <input
                value={loginForm.login}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, login: e.target.value })
                }
                required
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-full">
              Войти
            </button>
          </form>
        </div>
        <Toast message={toast} onClose={() => setToast(null)} />
      </div>
    );
  }

  return (
    <div className="page page-app">
      <header className="app-header">
        <div className="app-header-container">
          <div className="app-header-left">
            <img src="/logo.png" alt="ННМЦ" className="app-logo" />
            <div className="app-header-left-info">
              <div className="app-title">KPI по табелю — ННМЦ</div>
              <div className="app-subtitle">{user.login} ({user.role})</div>
            </div>
          </div>
          <nav className="app-nav">
          <button
            className={
              "app-nav-tab" + (activeTab === "calc" ? " app-nav-tab-active" : "")
            }
            onClick={() => setActiveTab("calc")}
          >
            Расчёт KPI по табелю
          </button>
          <button
            className={
              "app-nav-tab" + (activeTab === "kpi" ? " app-nav-tab-active" : "")
            }
            onClick={() => setActiveTab("kpi")}
          >
            Справочник сотрудников / История изменений
          </button>
          </nav>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {activeTab === "calc" && (
          <section className="card">
            <h2>Расчёт KPI по табелю</h2>
            <p className="card-subtitle">
              Загрузите табель за месяц, укажите рабочие дни (дневные/суточные)
              и нажмите «Рассчитать». Ниже появятся результаты и ошибки (если
              есть).
            </p>

            <div className="form-grid">
              <div className="form-group file-field">
                <label>Табель (Excel):</label>
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={(e) => setTimesheetFile(e.target.files[0] || null)}
                />
              </div>

              <div className="form-group">
                <label>Рабочие дни ДНЕВНЫЕ:</label>
                <input
                  type="number"
                  value={nchDay}
                  onChange={(e) => setNchDay(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Рабочие дни СУТОЧНЫЕ:</label>
                <input
                  type="number"
                  value={ndShift}
                  onChange={(e) => setNdShift(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Год:</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>

              <div className="form-group month-field">
                <label>Месяц (1–12):</label>
                <input
                  type="number"
                  value={month}
                  min={1}
                  max={12}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>

              <div className="form-group holiday-field">
                <label>Праздничные дни (добавьте даты):</label>
                <div className="holiday-row">
                  <input
                    type="date"
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                  />
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={async () => {
                      if (!holidayDate) return;
                      const monthStr = String(month).padStart(2, "0");
                      if (!holidayDate.startsWith(year + "-" + monthStr)) {
                        showToast("Выберите дату в выбранном месяце", "error");
                        return;
                      }
                      // Проверяем, не добавлен ли уже
                      if (holidays.some((h) => h.date === holidayDate)) {
                        showToast("Этот праздник уже добавлен", "error");
                        return;
                      }
                      
                      try {
                        // Сохраняем в Strapi (с проверкой на дубликаты на сервере)
                        await apiAddHoliday(holidayDate, year, month);
                        setHolidayDate("");
                        showToast("Праздник добавлен");
                        // Перезагружаем из Strapi, чтобы получить актуальный список с ID
                        const updated = await apiHolidays(year, month);
                        setHolidays(updated || []);
                      } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        showToast(errorMsg || "Ошибка добавления праздника", "error");
                      }
                    }}
                  >
                    Добавить
                  </button>
                </div>
                {holidays.length > 0 ? (
                  <div className="holiday-chips">
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>
                      Сохранённые праздничные дни ({holidays.length}):
                    </div>
                    {holidays.map((h) => {
                      // Форматируем дату для отображения: "2025-12-16" -> "16 декабря"
                      const dateObj = new Date(h.date + 'T00:00:00');
                      const day = dateObj.getDate();
                      const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                                         'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
                      const monthName = monthNames[dateObj.getMonth()];
                      const displayDate = `${day} ${monthName}`;
                      
                      return (
                        <span key={h.id || h.date} className="chip" title={`${h.date} (праздничный день)`}>
                          {displayDate}
                          <button
                            type="button"
                            className="chip-x"
                            onClick={async () => {
                              if (h.id) {
                                // Удаляем из Strapi
                                try {
                                  await apiDeleteHoliday(h.id);
                                  showToast("Праздник удалён");
                                  // Перезагружаем из Strapi
                                  const updated = await apiHolidays(year, month);
                                  setHolidays(updated || []);
                                } catch (err) {
                                  const errorMsg = err instanceof Error ? err.message : String(err);
                                  showToast(errorMsg || "Ошибка удаления праздника", "error");
                                }
                              } else {
                                // Если нет ID, просто удаляем локально
                                setHolidays(holidays.filter((x) => x.date !== h.date));
                              }
                            }}
                            title="Удалить праздничный день"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', fontStyle: 'italic' }}>
                    Праздничные дни не добавлены для этого месяца
                  </div>
                )}
              </div>
            </div>

            <div className="btn-row">
              <button className="btn btn-primary" onClick={handleCalc}>
                Рассчитать и показать
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleDownload("excel")}
              >
                Скачать общий Excel
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleDownload("1c")}
              >
                Скачать для 1С
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleDownload("buh")}
              >
                Скачать для бухгалтерии
              </button>
            </div>

            {calcResults.length > 0 && (
              <div className="results-block">
                <h3>Результаты расчёта</h3>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>ФИО</th>
                        <th>График</th>
                        <th>Отдел</th>
                        <th>Норма дней</th>
                        <th>Факт дней</th>
                        <th>% выполнения</th>
                        <th>KPI сумм</th>
                        <th>KPI итог</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calcResults.map((r, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td>{r.fio}</td>
                          <td>{r.scheduleType}</td>
                          <td>{r.department}</td>
                          <td>{r.daysAssigned}</td>
                          <td>{r.daysWorked}</td>
                          <td>{r.workPercent}</td>
                          <td>{r.kpiSum}</td>
                          <td>{r.kpiFinal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {calcIssues.length > 0 && (
              <div className="issues-block">
                <div className="issues-header">
                  <h3>Ошибки и предупреждения</h3>
                  <p>
                    Проверьте корректность заполнения табеля и справочника KPI.
                  </p>
                </div>
                <div className="issues-table">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Сотрудник</th>
                        <th>Тип</th>
                        <th>Описание</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calcIssues.map((issue, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td>{issue.fio || "—"}</td>
                          <td>{issue.type || "—"}</td>
                          <td>{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === "kpi" && (
          <section className="card">
            <div className="card-header-row">
              <div>
                <h2>Справочник сотрудников KPI</h2>
                <p className="card-subtitle">
                  Добавление, редактирование, удаление и восстановление
                  сотрудников. Все операции пишутся в Excel-логи.
                </p>
              </div>
              <button className="btn btn-primary" onClick={openAddForm}>
                + Добавить сотрудника
              </button>
            </div>

            <div className="kpi-tabs">
              <button
                className={
                  "kpi-tab" + (kpiTab === "list" ? " kpi-tab-active" : "")
                }
                onClick={() => setKpiTab("list")}
              >
                Текущий список
              </button>
              <button
                className={
                  "kpi-tab" + (kpiTab === "deleted" ? " kpi-tab-active" : "")
                }
                onClick={() => setKpiTab("deleted")}
              >
                Удалённые сотрудники
              </button>
              <button
                className={
                  "kpi-tab" + (kpiTab === "history" ? " kpi-tab-active" : "")
                }
                onClick={() => setKpiTab("history")}
              >
                История изменений
              </button>
            </div>

            {kpiTab === "list" && (
              <>
                <div className="kpi-filters">
                  <input
                    className="kpi-search"
                    placeholder="Поиск по ФИО..."
                    value={searchFio}
                    onChange={(e) => setSearchFio(e.target.value)}
                  />
                  <select
                    className="kpi-select"
                    value={filterSchedule}
                    onChange={(e) => setFilterSchedule(e.target.value)}
                  >
                    <option value="all">Все графики</option>
                    <option value="day">Дневные</option>
                    <option value="shift">Суточные</option>
                  </select>
                  <select
                    className="kpi-select"
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                  >
                    <option value="">Все отделения</option>
                    {allDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <button
                    className="kpi-select"
                    onClick={() =>
                      setSortBy((prev) => (prev === "fio" ? "id" : "fio"))
                    }
                  >
                    Сортировать по: {sortBy === "fio" ? "ФИО" : "ID"}
                  </button>
                </div>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>ФИО</th>
                        <th>KPI сумм</th>
                        <th>График</th>
                        <th>Отдел</th>
                        <th>Категория</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredKpiItems.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center" }}>
                            Сотрудников не найдено.
                          </td>
                        </tr>
                      )}
                      {filteredKpiItems.map((emp) => (
                        <tr key={emp.id}>
                          <td>{emp.id}</td>
                          <td>{emp.fio}</td>
                          <td>{emp.kpiSum}</td>
                          <td>{emp.scheduleType}</td>
                          <td>{emp.department}</td>
                          <td>{emp.categoryCode}</td>
                          <td>
                            <button
                              className="btn btn-small"
                              onClick={() => openEditForm(emp)}
                            >
                              Редактировать
                            </button>
                            <button
                              className="btn btn-small btn-danger"
                              onClick={() => handleDeleteClick(emp)}
                            >
                              Удалить
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {kpiTab === "deleted" && (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>ФИО</th>
                      <th>KPI сумм</th>
                      <th>График</th>
                      <th>Отдел</th>
                      <th>Категория</th>
                      <th>Когда удалён</th>
                      <th>Кем</th>
                      <th>Причина</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!deletedItems || deletedItems.length === 0) && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: "center" }}>
                          Удалённых сотрудников нет.
                        </td>
                      </tr>
                    )}
                    {deletedItems &&
                      deletedItems.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.fio}</td>
                          <td>{row.kpiSum}</td>
                          <td>{row.scheduleType}</td>
                          <td>{row.department}</td>
                          <td>{row.categoryCode}</td>
                          <td>{row.timestamp || row.deleted_timestamp}</td>
                          <td>{row.user || row.deleted_by}</td>
                          <td>{row.reason || row.deleted_reason}</td>
                          <td>
                            <button
                              className="btn btn-small btn-primary"
                              onClick={() => handleRestore(row)}
                            >
                              Вернуть
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {kpiTab === "history" && (
              <div className="history-grid">
                <div>
                  <h3>Редактирования</h3>
                  <div className="table-wrapper small">
                    <table>
                      <thead>
                        <tr>
                          <th>Когда</th>
                          <th>Кто</th>
                          <th>ФИО</th>
                          <th>Отдел</th>
                          <th>График</th>
                          <th>Категория</th>
                          <th>KPI сумм</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!editedItems || editedItems.length === 0) && (
                          <tr>
                            <td colSpan={7} style={{ textAlign: "center" }}>
                              Нет записей.
                            </td>
                          </tr>
                        )}
                        {editedItems &&
                          editedItems.map((row, idx) => (
                            <tr key={idx}>
                              <td>{row.timestamp}</td>
                              <td>{row.user}</td>
                              <td>{formatChange(row.fio_old, row.fio_new)}</td>
                              <td>{formatChange(row.department_old, row.department_new)}</td>
                              <td>{formatChange(row.scheduleType_old, row.scheduleType_new)}</td>
                              <td>{formatChange(row.categoryCode_old, row.categoryCode_new)}</td>
                              <td>{formatChange(row.kpiSum_old, row.kpiSum_new)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3>Восстановления</h3>
                  <div className="table-wrapper small">
                    <table>
                      <thead>
                        <tr>
                          <th>Когда</th>
                          <th>Кто</th>
                          <th>ФИО</th>
                          <th>Отдел</th>
                          <th>График</th>
                          <th>Категория</th>
                          <th>KPI сумм</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!restoredItems || restoredItems.length === 0) && (
                          <tr>
                            <td colSpan={7} style={{ textAlign: "center" }}>
                              Нет записей.
                            </td>
                          </tr>
                        )}
                        {restoredItems &&
                          restoredItems.map((row, idx) => (
                            <tr key={idx}>
                              <td>{row.timestamp}</td>
                              <td>{row.user}</td>
                              <td>{row.fio}</td>
                              <td>{row.department}</td>
                              <td>{row.scheduleType}</td>
                              <td>{row.kpiSum}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <Toast message={toast} onClose={() => setToast(null)} />
      <DeleteConfirmModal
        employee={deleteModalEmployee}
        onCancel={() => setDeleteModalEmployee(null)}
        onConfirm={handleDeleteConfirm}
      />
      <EmployeeFormModal
        initial={formInitial}
        mode={formMode}
        onCancel={() => {
          setFormMode(null);
          setFormInitial(null);
        }}
        onSave={handleFormSave}
      />
    </div>
  );
}
