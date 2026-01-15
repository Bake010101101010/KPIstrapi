
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import io
import math
import pandas as pd
from datetime import datetime

from timesheet_parser import parse_timesheet_from_excel
from kpi_calculator import calculate_kpi_for_employees
from kpi_storage import (
    load_kpi_table,
    add_employee,
    edit_employee,
    delete_employee,
    load_users,
    ensure_all_files,
    load_deleted_log,
    load_edited_log,
    load_restored_log,
    log_restored,
)
from auth_utils import authenticate, create_session, require_auth_from_request

app = Flask(__name__)
CORS(app)

ensure_all_files()


import json

def _parse_holidays_from_form(req):
    """
    Ожидаем поле holidays в форме:
      - JSON-массив дат: ["2025-12-16","2025-12-17"]
      - или строка "16,17"
    Возвращает list[str|int]
    """
    raw = (req.form.get("holidays") or "").strip()
    if not raw:
        return []
    # JSON
    if raw.startswith("["):
        try:
            val = json.loads(raw)
            if isinstance(val, list):
                return val
        except Exception:
            pass
    # CSV
    parts = [p.strip() for p in raw.replace(";", ",").split(",") if p.strip()]
    out = []
    for p in parts:
        if p.isdigit():
            out.append(int(p))
        else:
            out.append(p)
    return out


def _get_current_user():
    user = require_auth_from_request(request)
    return user


def sanitize_value(v):
    if isinstance(v, float) and math.isnan(v):
        return ""
    return v


def sanitize_rows(rows):
    if not rows:
        return []
    clean = []
    for row in rows:
        if not isinstance(row, dict):
            clean.append(row)
            continue
        clean_row = {}
        for k, v in row.items():
            clean_row[k] = sanitize_value(v)
        clean.append(clean_row)
    return clean


def sanitize_record(rec):
    if rec is None or not isinstance(rec, dict):
        return rec
    clean = {}
    for k, v in rec.items():
        clean[k] = sanitize_value(v)
    return clean


def _calc_core(req):
    user = _get_current_user()
    if not user:
        return None, None, "AUTH_REQUIRED"

    if "timesheet" not in req.files:
        return None, None, "Не загружен файл табеля (timesheet)"

    timesheet_file = req.files["timesheet"]

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
    except ValueError:
        return None, None, "Год и месяц должны быть целыми числами"

    if year < 2000 or month < 1 or month > 12:
        return None, None, "Некорректные значения года или месяца"

    holidays = _parse_holidays_from_form(req)

    employees = parse_timesheet_from_excel(timesheet_file, year, month, holidays)
    kpi_table = load_kpi_table()

    results, errors = calculate_kpi_for_employees(
        employees=employees,
        kpi_table=kpi_table,
        nch_day=nch_day,
        nd_shift=nd_shift,
    )
    return results, errors, None


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    login_ = str(data.get("login", "")).strip()
    password = str(data.get("password", "")).strip()

    user = authenticate(login_, password)
    if not user:
        return jsonify({"error": "Неверный логин или пароль"}), 401

    token = create_session(user)
    return jsonify({
        "token": token,
        "login": user["login"],
        "role": user["role"],
    })


@app.route("/api/me", methods=["GET"])
def me():
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401
    return jsonify({
        "login": user["login"],
        "role": user["role"],
    })


@app.route("/api/calc-kpi-json", methods=["POST"])
def calc_kpi_json():
    try:
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
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/calc-kpi-excel", methods=["POST"])
def calc_kpi_excel():
    try:
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
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/calc-kpi-1c", methods=["POST"])
def calc_kpi_1c():
    try:
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
            
            # Форматируем колонки (опционально)
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
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/calc-kpi-buh", methods=["POST"])
def calc_kpi_buh():
    try:
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

            half = kpi_sum / 2.0
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
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/kpi-list", methods=["GET"])
def api_kpi_list():
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401

    rows = load_kpi_table()

    if not rows:
        return jsonify({"items": []})

    rows = sanitize_rows(rows)
    return jsonify({"items": rows})


@app.route("/api/kpi-add", methods=["POST"])
def kpi_add():
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
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    rec = sanitize_record(rec)
    return jsonify({"item": rec, "message": "Сотрудник успешно добавлен"})


@app.route("/api/kpi-edit", methods=["POST"])
def kpi_edit():
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
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    rec = sanitize_record(rec)
    return jsonify({"item": rec, "message": "Данные сотрудника успешно обновлены"})


@app.route("/api/kpi-delete", methods=["POST"])
def kpi_delete():
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
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    rec = sanitize_record(rec)
    return jsonify({"item": rec, "message": "Сотрудник успешно удалён"})


@app.route("/api/kpi-deleted-log", methods=["GET"])
def kpi_deleted_log_route():
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401

    df = load_deleted_log()
    df = df.fillna("")
    rows = df.to_dict(orient="records")
    rows = sanitize_rows(rows)
    return jsonify({"items": rows})


@app.route("/api/kpi-edited-log", methods=["GET"])
def kpi_edited_log_route():
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401

    df = load_edited_log()
    df = df.fillna("")
    rows = df.to_dict(orient="records")
    rows = sanitize_rows(rows)
    return jsonify({"items": rows})


@app.route("/api/kpi-restored-log", methods=["GET"])
def kpi_restored_log_route():
    user = _get_current_user()
    if not user:
        return jsonify({"error": "AUTH_REQUIRED"}), 401

    df = load_restored_log()
    df = df.fillna("")
    rows = df.to_dict(orient="records")
    rows = sanitize_rows(rows)
    return jsonify({"items": rows})


@app.route("/api/kpi-restore", methods=["POST"])
def kpi_restore():
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
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    rec = sanitize_record(rec)
    return jsonify({"item": rec, "message": "Сотрудник успешно восстановлен"})


@app.route("/api/ping", methods=["GET"])
def ping():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
