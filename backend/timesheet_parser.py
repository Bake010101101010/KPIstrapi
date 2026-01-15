
import pandas as pd
import math
from datetime import date
from typing import Iterable, Optional, Set, Union


def _normalize_holidays(holidays: Optional[Iterable[Union[str, int]]], year: int, month: int) -> Set[int]:
    """
    holidays can be:
      - None
      - list like ["2025-12-16", "2025-12-17"]  (any year/month; we only take day part if matches)
      - list like ["16", "17"] or [16, 17]
    returns set of day numbers (1..31) for given year/month.
    """
    out: Set[int] = set()
    if not holidays:
        return out

    for h in holidays:
        if h is None:
            continue
        if isinstance(h, int):
            if 1 <= h <= 31:
                out.add(int(h))
            continue

        s = str(h).strip()
        if not s:
            continue

        # if ISO date
        if len(s) >= 8 and "-" in s:
            parts = s.split("T")[0].split("-")
            if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit() and parts[2].isdigit():
                y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
                if y == year and m == month and 1 <= d <= 31:
                    out.add(d)
                continue

        # if day number string
        if s.isdigit():
            d = int(s)
            if 1 <= d <= 31:
                out.add(d)

    return out


def parse_timesheet_from_excel(file_storage, year: int, month: int, holidays=None):
    """
    Универсальный парсер табеля.

    Поддерживает:
      1) Шаблон ННМЦ на казахском:
         - строка с заголовком "АТЫ-жөні (толығымен)"
         - следующая строка — дни месяца (1..31)
         - часто есть колонка "өтелген күндер жиынтығы" (итого отработанных дней) — используем как факт для дневных
      2) Формат с колонкой "Сотрудник" и днями "01", "02", ..., "31".

    holidays: список праздничных дат/дней. Логика:
      - праздник ведет себя как воскресенье: буквы на празднике НЕ считаются как Н.о
      - если на празднике стоит число (сотрудник реально работал), мы считаем это как отработанный день/смену.

    На выходе:
      [
        {
          "fio": str,
          "letters_weekday": int,
          "letters_sat": int,
          "letters_sun": int,
          "letters_holiday": int,
          "numbers_weekday": int,
          "numbers_sat": int,
          "numbers_sun": int,
          "numbers_holiday": int,
          "workedDaysTotal": float|None,   # если есть в табеле (өтелген күндер жиынтығы)
        },
        ...
      ]
    """
    holiday_days = _normalize_holidays(holidays, year, month)

    # важно: без header, т.к. файлы часто имеют "шапку" до таблицы
    df = pd.read_excel(file_storage, header=None)

    if _has_kz_header(df):
        return _parse_kz_template(df, year, month, holiday_days)

    # если это "обычный" файл с header в первой строке
    df2 = pd.read_excel(file_storage)
    if "Сотрудник" in df2.columns:
        return _parse_simple_template(df2, year, month, holiday_days)

    raise ValueError(
        "Не удалось определить формат табеля. "
        "Нет ни заголовка 'АТЫ-жөні (толығымен)', ни колонки 'Сотрудник'."
    )


def _has_kz_header(df: pd.DataFrame) -> bool:
    for _, row in df.iterrows():
        if any(str(v).strip() == "АТЫ-жөні (толығымен)" for v in row.values):
            return True
    return False


def _classify_day(year: int, month: int, day_num: int, holiday_days: Set[int]):
    """
    Возвращает тип дня: 'weekday' | 'sat' | 'sun' | 'holiday'
    """
    if day_num in holiday_days:
        return "holiday"

    try:
        wd = date(year, month, day_num).weekday()  # 0=Пн, ..., 5=Сб, 6=Вс
    except ValueError:
        return "weekday"

    if wd == 5:
        return "sat"
    if wd == 6:
        return "sun"
    return "weekday"


def _try_float(val) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    try:
        s = str(val).strip().replace(",", ".")
        if not s:
            return None
        return float(s)
    except Exception:
        return None


def _find_cell(df: pd.DataFrame, text: str, search_rows: range):
    target = text.strip().lower()
    for r in search_rows:
        if r not in df.index:
            continue
        row = df.loc[r]
        for c, v in row.items():
            if isinstance(v, str) and v.strip().lower() == target:
                return r, c
    return None


def _parse_kz_template(df: pd.DataFrame, year: int, month: int, holiday_days: Set[int]):
    # Ищем строку заголовка с "АТЫ-жөні (толығымен)"
    header_row_idx = None
    for idx, row in df.iterrows():
        if any(str(v).strip() == "АТЫ-жөні (толығымен)" for v in row.values):
            header_row_idx = idx
            break
    if header_row_idx is None:
        raise ValueError("Не найден заголовок 'АТЫ-жөні (толығымен)' в табеле.")

    header_row = df.loc[header_row_idx]
    fio_col = None
    for col, v in header_row.items():
        if str(v).strip() == "АТЫ-жөні (толығымен)":
            fio_col = col
            break
    if fio_col is None:
        raise ValueError("Не удалось определить колонку с ФИО ('АТЫ-жөні (толығымен)').")

    # Строка с днями (1..31) — следующая
    day_header_idx = header_row_idx + 1
    if day_header_idx not in df.index:
        raise ValueError("В табеле нет строки с днями после заголовка.")
    day_header = df.loc[day_header_idx]

    # Собираем пары (колонка, номер дня)
    day_cols = []
    for col, v in day_header.items():
        s = str(v).strip()
        if s.isdigit():
            day_cols.append((col, int(s)))

    # Ищем колонку "өтелген күндер жиынтығы" поблизости заголовка
    found = _find_cell(df, "өтелген күндер жиынтығы", range(max(0, header_row_idx-2), header_row_idx+5))
    total_days_col = found[1] if found else None

    employees = []
    for idx in range(day_header_idx + 1, len(df)):
        row = df.loc[idx]

        fio_raw = row.get(fio_col, None)
        if fio_raw is None or (isinstance(fio_raw, float) and math.isnan(fio_raw)):
            continue
        fio = str(fio_raw).strip()
        if not fio or fio == "АТЫ-жөні (толығымен)":
            continue

        letters_weekday = letters_sat = letters_sun = letters_holiday = 0
        numbers_weekday = numbers_sat = numbers_sun = numbers_holiday = 0

        for col, day_num in day_cols:
            val = row.get(col, None)
            if val is None or (isinstance(val, float) and math.isnan(val)):
                continue
            val_str = str(val).strip()
            if not val_str or val_str == "-" or val_str.upper() == "В":
                continue

            day_type = _classify_day(year, month, day_num, holiday_days)

            # число?
            num = _try_float(val_str)
            is_number = (num is not None)

            if is_number:
                if day_type == "weekday":
                    numbers_weekday += 1
                elif day_type == "sat":
                    numbers_sat += 1
                elif day_type == "sun":
                    numbers_sun += 1
                else:
                    numbers_holiday += 1
            else:
                if day_type == "weekday":
                    letters_weekday += 1
                elif day_type == "sat":
                    letters_sat += 1
                elif day_type == "sun":
                    letters_sun += 1
                else:
                    letters_holiday += 1

        worked_days_total = None
        if total_days_col is not None:
            worked_days_total = _try_float(row.get(total_days_col, None))

        employees.append({
            "fio": fio,
            "letters_weekday": letters_weekday,
            "letters_sat": letters_sat,
            "letters_sun": letters_sun,
            "letters_holiday": letters_holiday,
            "numbers_weekday": numbers_weekday,
            "numbers_sat": numbers_sat,
            "numbers_sun": numbers_sun,
            "numbers_holiday": numbers_holiday,
            "workedDaysTotal": worked_days_total,
        })

    return employees


def _parse_simple_template(df: pd.DataFrame, year: int, month: int, holiday_days: Set[int]):
    # Дни: "01", "02", ..., "31"
    day_cols = []
    for col in df.columns:
        if isinstance(col, str) and len(col) == 2 and col.isdigit():
            day_cols.append((col, int(col)))

    employees = []
    for _, row in df.iterrows():
        fio = str(row.get("Сотрудник", "")).strip()
        if not fio:
            continue

        letters_weekday = letters_sat = letters_sun = letters_holiday = 0
        numbers_weekday = numbers_sat = numbers_sun = numbers_holiday = 0

        for col, day_num in day_cols:
            val = row.get(col, None)
            if val is None or (isinstance(val, float) and math.isnan(val)):
                continue
            val_str = str(val).strip()
            if not val_str or val_str == "-" or val_str.upper() == "В":
                continue

            day_type = _classify_day(year, month, day_num, holiday_days)

            num = _try_float(val_str)
            is_number = (num is not None)

            if is_number:
                if day_type == "weekday":
                    numbers_weekday += 1
                elif day_type == "sat":
                    numbers_sat += 1
                elif day_type == "sun":
                    numbers_sun += 1
                else:
                    numbers_holiday += 1
            else:
                if day_type == "weekday":
                    letters_weekday += 1
                elif day_type == "sat":
                    letters_sat += 1
                elif day_type == "sun":
                    letters_sun += 1
                else:
                    letters_holiday += 1

        employees.append({
            "fio": fio,
            "letters_weekday": letters_weekday,
            "letters_sat": letters_sat,
            "letters_sun": letters_sun,
            "letters_holiday": letters_holiday,
            "numbers_weekday": numbers_weekday,
            "numbers_sat": numbers_sat,
            "numbers_sun": numbers_sun,
            "numbers_holiday": numbers_holiday,
            "workedDaysTotal": None,
        })

    return employees
