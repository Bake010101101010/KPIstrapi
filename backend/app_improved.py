"""
Улучшенное Flask приложение с полной обработкой ошибок и валидацией
"""
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import io
import logging
import pandas as pd
from datetime import datetime

from config import Config
from timesheet_parser import parse_timesheet_from_excel
from kpi_calculator_improved import calculate_kpi_for_employees
from kpi_storage import (
    load_kpi_table,
    add_employee,
    edit_employee,
    delete_employee,
    ensure_all_files,
    load_deleted_log,
    load_edited_log,
    load_restored_log,
    log_restored,
)
from auth_utils_improved import (
    authenticate,
    create_session,
    require_auth_from_request,
    cleanup_expired_sessions
)
from calendar_manager import calendar_manager
from utils import (
    handle_errors,
    sanitize_rows,
    sanitize_record,
    validate_file_size,
    validate_file_extension,
    validate_year_month,
    parse_holidays_from_form
)

# Настройка логирования
logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(Config.LOG_FILE, encoding='utf-8'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = Config.SECRET_KEY
CORS(app, origins=Config.CORS_ORIGINS)

# Инициализация
Config.ensure_directories()
ensure_all_files()


def _get_current_user():
    """Получает текущего пользователя из запроса"""
    user = require_auth_from_request(request)
    if not user:
        return None
    return user


def _calc_core(req):
    """
    Основная логика расчета KPI
    
    Returns:
        Tuple (results, errors, error_message)
    """
    user = _get_current_user()
    if not user:
        return None, None, "AUTH_REQUIRED"
    
    # Валидация файла
    if "timesheet" not in req.files:
        return None, None, "Не загружен файл табеля (timesheet)"
    
    timesheet_file = req.files["timesheet"]
    
    # Валидация размера и расширения
    try:
        validate_file_size(timesheet_file, Config.MAX_FILE_SIZE)
        validate_file_extension(timesheet_file.filename)
    except ValueError as e:
        return None, None, str(e)
    
    # Параметры расчета
    try:
        nch_day = int(req.form.get("nchDay", "0"))
        nd_shift = int(req.form.get("ndShift", "0"))
    except ValueError:
        return None, None, "Н.ч и Н.д должны быть целыми числами"
    
    if nch_day <= 0 and nd_shift <= 0:
        return None, None, "Нужно указать Н.ч для дневных и/или Н.д для суточных"
    
    try:
        year = int(req.form.get("year", "0"))
        month = int(req.form.get("month", "0"))
        validate_year_month(year, month)
    except ValueError as e:
        return None, None, str(e)
    
    holidays = parse_holidays_from_form(req)
    
    # Добавляем праздники в календарь (временные)
    for holiday in holidays:
        try:
            if isinstance(holiday, str) and '-' in holiday:
                holiday_date = datetime.strptime(holiday, '%Y-%m-%d').date()
            elif isinstance(holiday, int):
                holiday_date = datetime(year, month, holiday).date()
            else:
                continue
            calendar_manager.add_holiday(holiday_date)
        except Exception as e:
            logger.warning(f"Ошибка добавления праздника {holiday}: {e}")
    
    # Парсинг табеля
    try:
        employees = parse_timesheet_from_excel(timesheet_file, year, month, holidays)
    except Exception as e:
        logger.error(f"Ошибка парсинга табеля: {e}")
        return None, None, f"Ошибка чтения табеля: {str(e)}"
    
    # Загрузка KPI таблицы
    kpi_table = load_kpi_table()
    
    # Расчет KPI
    try:
        results, errors = calculate_kpi_for_employees(
            employees=employees,
            kpi_table=kpi_table,
            nch_day=nch_day,
            nd_shift=nd_shift,
            year=year,
            month=month
        )
    except Exception as e:
        logger.error(f"Ошибка расчета KPI: {e}")
        return None, None, f"Ошибка расчета KPI: {str(e)}"
    
    return results, errors, None


# ==================== АУТЕНТИФИКАЦИЯ ====================

@app.route("/api/login", methods=["POST"])
@handle_errors
def login():
    """Авторизация пользователя"""
    data = request.get_json(force=True)
    login_ = str(data.get("login", "")).strip()
    password = str(data.get("password", "")).strip()
    
    if not login_ or not password:
        return jsonify({"error": "Логин и пароль обязательны"}), 400
    
    user = authenticate(login_, password)
    if not user:
        return jsonify({"error": "Неверный логин или пароль"}), 401
    
    token = create_session(user)
    logger.info(f"Пользователь {login_} успешно авторизован")
    
    return jsonify({
        "token": token,
        "login": user["login"],
        "role": user["role"],
    })


@app.route("/api/me", methods=["GET"])
@handle_errors
def me():
    """Получение информации о текущем пользователе"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    return jsonify({
        "login": user["login"],
        "role": user["role"],
    })


@app.route("/api/logout", methods=["POST"])
@handle_errors
def logout():
    """Выход из системы"""
    # В текущей реализации сессии в памяти, просто удаляем токен на клиенте
    # В продакшене здесь можно удалить сессию из Redis
    return jsonify({"message": "Успешный выход"})


# ==================== РАСЧЕТ KPI ====================

@app.route("/api/calc-kpi-json", methods=["POST"])
@handle_errors
def calc_kpi_json():
    """Расчет KPI с возвратом JSON"""
    results, errors, err = _calc_core(request)
    if err:
        if err == "AUTH_REQUIRED":
            return jsonify({"error": "AUTH_REQUIRED"}), 401
        return jsonify({"error": err}), 400
    
    results = sanitize_rows(results)
    errors = sanitize_rows(errors)
    
    return jsonify({
        "results": results,
        "errors": errors,
    })


@app.route("/api/calc-kpi-excel", methods=["POST"])
@handle_errors
def calc_kpi_excel():
    """Расчет KPI с возвратом Excel файла"""
    results, errors, err = _calc_core(request)
    if err:
        if err == "AUTH_REQUIRED":
            return jsonify({"error": "AUTH_REQUIRED"}), 401
        return jsonify({"error": err}), 400
    
    results = sanitize_rows(results)
    errors = sanitize_rows(errors)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df_res = pd.DataFrame(results)
        df_res.to_excel(writer, index=False, sheet_name="KPI")
        
        if errors:
            df_err = pd.DataFrame(errors)
            df_err.to_excel(writer, index=False, sheet_name="Errors")
    
    output.seek(0)
    filename = f"KPIfinal_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return send_file(
        output,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/api/calc-kpi-1c", methods=["POST"])
@handle_errors
def calc_kpi_1c():
    """Расчет KPI для экспорта в 1С"""
    import math
    
    results, errors, err = _calc_core(request)
    if err:
        if err == "AUTH_REQUIRED":
            return jsonify({"error": "AUTH_REQUIRED"}), 401
        return jsonify({"error": err}), 400
    
    results = sanitize_rows(results)
    
    rows = []
    for idx, r in enumerate(results, start=1):
        kpi_final = float(r.get("kpiFinal", 0) or 0)
        # Округление вверх до целого числа
        kpi_final_rounded = int(math.ceil(kpi_final))
        
        rows.append({
            "№": idx,
            "ФИО": r.get("fio", ""),
            "KPI_итог": kpi_final_rounded,
        })
    
    df = pd.DataFrame(rows)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        # Записываем без заголовков (header=False)
        df.to_excel(writer, index=False, header=False, sheet_name="1C")
        
        # Получаем workbook и worksheet для форматирования
        workbook = writer.book
        worksheet = writer.sheets['1C']
        
        # Форматируем колонки
        # Колонка с номером - целое число
        num_format = workbook.add_format({'num_format': '0'})
        worksheet.set_column('A:A', 8, num_format)  # Колонка №
        # Колонка с KPI - целое число без десятичных
        worksheet.set_column('C:C', 12, num_format)  # Колонка KPI_итог
    
    output.seek(0)
    filename = f"KPI_for_1C_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return send_file(
        output,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/api/calc-kpi-buh", methods=["POST"])
@handle_errors
def calc_kpi_buh():
    """Расчет KPI для бухгалтерии"""
    results, errors, err = _calc_core(request)
    if err:
        if err == "AUTH_REQUIRED":
            return jsonify({"error": "AUTH_REQUIRED"}), 401
        return jsonify({"error": err}), 400
    
    results = sanitize_rows(results)
    
    rows = []
    for r in results:
        fio = r.get("fio", "")
        kpi_sum = float(r.get("kpiSum", 0) or 0)
        work_percent = float(r.get("workPercent", 0) or 0)
        kpi_final = float(r.get("kpiFinal", 0) or 0)
        
        half = kpi_sum / 2.0 if kpi_sum > 0 else 0
        kpr1_plan = half
        kpr2_plan = half
        
        kpr1_final = round(half * work_percent / 100.0, 2)
        kpr2_final = round(half * work_percent / 100.0, 2)
        
        rows.append({
            "ФИО": fio,
            "KPI_план": kpi_sum,
            "KPI_%": work_percent,
            "KPI_итог": kpi_final,
            "КПР1_план": kpr1_plan,
            "КПР1_%": work_percent,
            "КПР1_итог": kpr1_final,
            "КПР2_план": kpr2_plan,
            "КПР2_%": work_percent,
            "КПР2_итог": kpr2_final,
        })
    
    df = pd.DataFrame(rows)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Buh")
    
    output.seek(0)
    filename = f"KPI_for_Buh_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return send_file(
        output,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


# ==================== КАЛЕНДАРЬ И ПРАЗДНИКИ ====================

@app.route("/api/calendar/days", methods=["GET"])
@handle_errors
def get_calendar_days():
    """Получение дней месяца с типами"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    try:
        year = int(request.args.get("year", datetime.now().year))
        month = int(request.args.get("month", datetime.now().month))
        validate_year_month(year, month)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    
    days = calendar_manager.get_days_in_month(year, month)
    return jsonify({"days": days})


@app.route("/api/calendar/holidays", methods=["GET"])
@handle_errors
def get_holidays():
    """Получение списка праздничных дней"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    
    holidays = calendar_manager.get_holidays(year, month)
    holidays_list = sorted([d.isoformat() for d in holidays])
    
    return jsonify({"holidays": holidays_list})


@app.route("/api/calendar/holidays", methods=["POST"])
@handle_errors
def add_holiday():
    """Добавление праздничного дня"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    data = request.get_json(force=True)
    holiday_str = data.get("date")
    
    if not holiday_str:
        return jsonify({"error": "Дата обязательна"}), 400
    
    try:
        holiday_date = datetime.strptime(holiday_str, '%Y-%m-%d').date()
        added = calendar_manager.add_holiday(holiday_date)
        
        if added:
            logger.info(f"Праздничный день добавлен: {holiday_date} пользователем {user['login']}")
            return jsonify({"message": "Праздничный день добавлен", "date": holiday_str})
        else:
            return jsonify({"message": "Праздничный день уже существует", "date": holiday_str})
    except ValueError:
        return jsonify({"error": "Неверный формат даты. Используйте YYYY-MM-DD"}), 400


@app.route("/api/calendar/holidays", methods=["DELETE"])
@handle_errors
def remove_holiday():
    """Удаление праздничного дня"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    holiday_str = request.args.get("date")
    
    if not holiday_str:
        return jsonify({"error": "Дата обязательна"}), 400
    
    try:
        holiday_date = datetime.strptime(holiday_str, '%Y-%m-%d').date()
        removed = calendar_manager.remove_holiday(holiday_date)
        
        if removed:
            logger.info(f"Праздничный день удален: {holiday_date} пользователем {user['login']}")
            return jsonify({"message": "Праздничный день удален"})
        else:
            return jsonify({"message": "Праздничный день не найден"}), 404
    except ValueError:
        return jsonify({"error": "Неверный формат даты. Используйте YYYY-MM-DD"}), 400


# ==================== УПРАВЛЕНИЕ СОТРУДНИКАМИ ====================

@app.route("/api/kpi-list", methods=["GET"])
@handle_errors
def api_kpi_list():
    """Получение списка сотрудников"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    rows = load_kpi_table()
    if not rows:
        return jsonify({"items": []})
    
    rows = sanitize_rows(rows)
    return jsonify({"items": rows})


@app.route("/api/kpi-add", methods=["POST"])
@handle_errors
def kpi_add():
    """Добавление сотрудника"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    data = request.get_json(force=True)
    fio = str(data.get("fio", "")).strip()
    if not fio:
        return jsonify({"error": "Укажите ФИО как в удостоверении личности или в 1С"}), 400
    
    try:
        kpiSum = float(data.get("kpiSum", 0) or 0)
    except ValueError:
        return jsonify({"error": "kpiSum должен быть числом"}), 400
    
    if kpiSum <= 0:
        return jsonify({"error": "Укажите KPI сумм (тенге)"}), 400
    
    scheduleType = str(data.get("scheduleType", "")).strip() or "day"
    department = str(data.get("department", "")).strip()
    categoryCode = str(data.get("categoryCode", "")).strip()
    
    if not scheduleType:
        return jsonify({"error": "Укажите график работы"}), 400
    if not department:
        return jsonify({"error": "Укажите отделение"}), 400
    
    try:
        rec = add_employee(
            user=user["login"],
            fio=fio,
            kpiSum=kpiSum,
            scheduleType=scheduleType,
            department=department,
            categoryCode=categoryCode,
        )
        logger.info(f"Сотрудник добавлен: {fio} пользователем {user['login']}")
    except Exception as e:
        logger.error(f"Ошибка добавления сотрудника: {e}")
        return jsonify({"error": str(e)}), 400
    
    rec = sanitize_record(rec)
    return jsonify({"item": rec, "message": "Сотрудник успешно добавлен"})


@app.route("/api/kpi-edit", methods=["POST"])
@handle_errors
def kpi_edit():
    """Редактирование сотрудника"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    data = request.get_json(force=True)
    try:
        emp_id = int(data.get("id"))
    except Exception:
        return jsonify({"error": "id обязателен и должен быть числом"}), 400
    
    fio = data.get("fio")
    department = data.get("department")
    scheduleType = data.get("scheduleType")
    categoryCode = data.get("categoryCode")
    kpiSum = data.get("kpiSum", None)
    
    if fio is not None and not str(fio).strip():
        return jsonify({"error": "ФИО не может быть пустым"}), 400
    if department is not None and not str(department).strip():
        return jsonify({"error": "Отделение не может быть пустым"}), 400
    
    allow_kpi_edit = user.get("role") == "admin"
    
    try:
        rec = edit_employee(
            user=user["login"],
            emp_id=emp_id,
            fio=fio,
            department=department,
            scheduleType=scheduleType,
            categoryCode=categoryCode,
            kpiSum=kpiSum,
            allow_kpi_edit=allow_kpi_edit,
        )
        logger.info(f"Сотрудник отредактирован: ID={emp_id} пользователем {user['login']}")
    except Exception as e:
        logger.error(f"Ошибка редактирования сотрудника: {e}")
        return jsonify({"error": str(e)}), 400
    
    rec = sanitize_record(rec)
    return jsonify({"item": rec, "message": "Данные сотрудника успешно обновлены"})


@app.route("/api/kpi-delete", methods=["POST"])
@handle_errors
def kpi_delete():
    """Удаление сотрудника"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    data = request.get_json(force=True)
    try:
        emp_id = int(data.get("id"))
    except Exception:
        return jsonify({"error": "id обязателен и должен быть числом"}), 400
    
    reason = str(data.get("reason", "")).strip()
    if not reason:
        reason = "не указано"
    
    try:
        rec = delete_employee(user=user["login"], emp_id=emp_id, reason=reason)
        logger.info(f"Сотрудник удален: ID={emp_id} пользователем {user['login']}, причина: {reason}")
    except Exception as e:
        logger.error(f"Ошибка удаления сотрудника: {e}")
        return jsonify({"error": str(e)}), 400
    
    rec = sanitize_record(rec)
    return jsonify({"item": rec, "message": "Сотрудник успешно удалён"})


@app.route("/api/kpi-restore", methods=["POST"])
@handle_errors
def kpi_restore():
    """Восстановление сотрудника"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    data = request.get_json(force=True)
    fio = str(data.get("fio", "")).strip()
    if not fio:
        return jsonify({"error": "ФИО обязательно"}), 400
    
    try:
        kpiSum = float(data.get("kpiSum", 0) or 0)
    except ValueError:
        return jsonify({"error": "kpiSum должен быть числом"}), 400
    
    scheduleType = str(data.get("scheduleType", "")).strip() or "day"
    department = str(data.get("department", "")).strip()
    categoryCode = str(data.get("categoryCode", "")).strip()
    
    if not department:
        return jsonify({"error": "Укажите отделение"}), 400
    
    source_deleted = {
        "timestamp": data.get("deleted_timestamp"),
        "user": data.get("deleted_by"),
        "reason": data.get("deleted_reason"),
    }
    
    try:
        rec = add_employee(
            user=user["login"],
            fio=fio,
            kpiSum=kpiSum,
            scheduleType=scheduleType,
            department=department,
            categoryCode=categoryCode,
        )
        log_restored(user=user["login"], rec=rec, source_deleted=source_deleted)
        logger.info(f"Сотрудник восстановлен: {fio} пользователем {user['login']}")
    except Exception as e:
        logger.error(f"Ошибка восстановления сотрудника: {e}")
        return jsonify({"error": str(e)}), 400
    
    rec = sanitize_record(rec)
    return jsonify({"item": rec, "message": "Сотрудник успешно восстановлен"})


# ==================== ЛОГИ ====================

@app.route("/api/kpi-deleted-log", methods=["GET"])
@handle_errors
def kpi_deleted_log_route():
    """Получение лога удалений"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    df = load_deleted_log()
    df = df.fillna("")
    rows = df.to_dict(orient="records")
    rows = sanitize_rows(rows)
    return jsonify({"items": rows})


@app.route("/api/kpi-edited-log", methods=["GET"])
@handle_errors
def kpi_edited_log_route():
    """Получение лога редактирований"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    df = load_edited_log()
    df = df.fillna("")
    rows = df.to_dict(orient="records")
    rows = sanitize_rows(rows)
    return jsonify({"items": rows})


@app.route("/api/kpi-restored-log", methods=["GET"])
@handle_errors
def kpi_restored_log_route():
    """Получение лога восстановлений"""
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    
    df = load_restored_log()
    df = df.fillna("")
    rows = df.to_dict(orient="records")
    rows = sanitize_rows(rows)
    return jsonify({"items": rows})


# ==================== СЛУЖЕБНЫЕ ====================

@app.route("/api/ping", methods=["GET"])
def ping():
    """Проверка работоспособности API"""
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


@app.before_request
def before_request():
    """Очистка истекших сессий перед каждым запросом"""
    cleanup_expired_sessions()


if __name__ == "__main__":
    logger.info("Запуск приложения...")
    app.run(host="0.0.0.0", port=5000, debug=True)

