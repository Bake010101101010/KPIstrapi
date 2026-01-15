
def calculate_kpi_for_employees(employees, kpi_table, nch_day, nd_shift):
    """
    Обновленная версия (учитывает):
      - колонку "өтелген күндер жиынтығы" (workedDaysTotal) для дневных: если она есть, берем факт дней из неё
        (это решает кейс "1 рабочая суббота", когда в табеле в субботу стоит цифра)
      - праздники: буквы на праздники не считаются как Н.о (как воскресенье), числа на праздники считаются как работа

    employees: список словарей из parse_timesheet_from_excel (timesheet_parser.py)
    kpi_table: список записей из KPI-таблицы (Excel/бэкенд)
    """

    # карта ФИО -> запись KPI
    kpi_map = {}
    for item in kpi_table:
        key = str(item.get("fio", "")).strip().lower()
        if key:
            kpi_map[key] = item

    seen = set()
    results = []
    errors = []

    for emp in employees:
        fio = str(emp.get("fio", "")).strip()
        if not fio:
            continue
        fio_key = fio.lower()

        if fio_key in seen:
            errors.append({"fio": fio, "type": "DUPLICATE", "details": "ФИО повторяется в табеле"})
            continue
        seen.add(fio_key)

        kpi_info = kpi_map.get(fio_key)
        if not kpi_info:
            errors.append({"fio": fio, "type": "NO_KPI_MAPPING", "details": "Нет записи в KPI таблице"})
            continue

        # Исключаем студентов (categoryCode == "4")
        if str(kpi_info.get("categoryCode", "")).strip() == "4":
            errors.append({"fio": fio, "type": "STUDENT", "details": "CategoryCode = 4 (студент), KPI не считается"})
            continue

        schedule_type = str(kpi_info.get("scheduleType", "")).strip().lower()
        if schedule_type not in ("day", "shift"):
            schedule_type = "day"

        kpi_sum = float(kpi_info.get("kpiSum", 0.0) or 0.0)

        letters_weekday = int(emp.get("letters_weekday", 0) or 0)
        letters_sat = int(emp.get("letters_sat", 0) or 0)
        letters_sun = int(emp.get("letters_sun", 0) or 0)
        letters_holiday = int(emp.get("letters_holiday", 0) or 0)

        numbers_weekday = int(emp.get("numbers_weekday", 0) or 0)
        numbers_sat = int(emp.get("numbers_sat", 0) or 0)
        numbers_sun = int(emp.get("numbers_sun", 0) or 0)
        numbers_holiday = int(emp.get("numbers_holiday", 0) or 0)

        worked_days_total = emp.get("workedDaysTotal", None)

        if schedule_type == "day":
            days_assigned = int(nch_day or 0)
            if days_assigned <= 0:
                errors.append({"fio": fio, "type": "INVALID_PLAN", "details": "Н.ч (назначено дней) <= 0"})
                continue

            # Базовое правило: Н.о = буквы в будни. Буквы в СБ/ВС/праздники не считаем.
            not_worked = letters_weekday

            # Если в табеле есть "өтелген күндер жиынтығы" — берем факт дней оттуда (лучшее источник правды)
            fv = None
            try:
                if worked_days_total is not None:
                    fv = float(worked_days_total)
            except Exception:
                fv = None

            if fv is None:
                fv = days_assigned - not_worked

            # нормализация
            if fv < 0:
                fv = 0
            if fv > days_assigned:
                fv = days_assigned

            work_percent = (fv * 100.0) / days_assigned if days_assigned > 0 else 0.0
            if work_percent > 100.0:
                work_percent = 100.0
            if work_percent < 0.0:
                work_percent = 0.0

            kpi_final = (work_percent / 100.0) * kpi_sum

            results.append({
                "fio": fio,
                "scheduleType": "day",
                "daysAssigned": days_assigned,
                "daysWorked": fv,
                "notWorked": max(days_assigned - fv, 0),
                "lettersWeekday": letters_weekday,
                "lettersSat": letters_sat,
                "lettersSun": letters_sun,
                "lettersHoliday": letters_holiday,
                "numbersWeekday": numbers_weekday,
                "numbersSat": numbers_sat,
                "numbersSun": numbers_sun,
                "numbersHoliday": numbers_holiday,
                "workPercent": round(work_percent, 2),
                "kpiSum": kpi_sum,
                "kpiFinal": round(kpi_final, 2),
            })

        else:
            days_assigned = int(nd_shift or 0)
            if days_assigned <= 0:
                errors.append({"fio": fio, "type": "INVALID_PLAN", "details": "Н.д (назначено суточных) <= 0"})
                continue

            # Суточные: Н.о = буквы в будни + буквы в субботу. Буквы в воскресенье/праздники не считаем.
            effective_not_worked = letters_weekday + letters_sat

            work_rate = days_assigned - effective_not_worked
            if work_rate < 0:
                work_rate = 0
            if work_rate > days_assigned:
                work_rate = days_assigned

            work_percent = (work_rate * 100.0) / days_assigned if days_assigned > 0 else 0.0
            if work_percent > 100.0:
                work_percent = 100.0
            if work_percent < 0.0:
                work_percent = 0.0

            kpi_final = (work_percent / 100.0) * kpi_sum

            results.append({
                "fio": fio,
                "scheduleType": "shift",
                "daysAssigned": days_assigned,
                "daysWorked": work_rate,
                "notWorked": effective_not_worked,
                "lettersWeekday": letters_weekday,
                "lettersSat": letters_sat,
                "lettersSun": letters_sun,
                "lettersHoliday": letters_holiday,
                "numbersWeekday": numbers_weekday,
                "numbersSat": numbers_sat,
                "numbersSun": numbers_sun,
                "numbersHoliday": numbers_holiday,
                "workPercent": round(work_percent, 2),
                "kpiSum": kpi_sum,
                "kpiFinal": round(kpi_final, 2),
            })

    return results, errors
