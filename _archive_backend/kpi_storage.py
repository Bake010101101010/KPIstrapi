
import os
import pandas as pd
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KPI_FILE = os.path.join(BASE_DIR, "KPIsum_dynamic.xlsx")
ADDED_FILE = os.path.join(BASE_DIR, "KPI_added_log.xlsx")
DELETED_FILE = os.path.join(BASE_DIR, "KPI_deleted_log.xlsx")
EDITED_FILE = os.path.join(BASE_DIR, "KPI_edited_log.xlsx")
RESTORED_FILE = os.path.join(BASE_DIR, "KPI_restored_log.xlsx")
USERS_FILE = os.path.join(BASE_DIR, "users.xlsx")


def _ensure_file(path: str, columns):
    if not os.path.exists(path):
        df = pd.DataFrame(columns=columns)
        df.to_excel(path, index=False)


def ensure_all_files():
    # main KPI file
    if not os.path.exists(KPI_FILE):
        df = pd.DataFrame(columns=[
            "id", "fio", "kpiSum", "scheduleType", "department", "categoryCode"
        ])
        df.to_excel(KPI_FILE, index=False)

    _ensure_file(ADDED_FILE, [
        "timestamp", "user", "id", "fio", "kpiSum", "scheduleType", "department", "categoryCode", "details"
    ])
    _ensure_file(DELETED_FILE, [
        "timestamp", "user", "id", "fio", "kpiSum", "scheduleType", "department", "categoryCode", "reason"
    ])
    _ensure_file(EDITED_FILE, [
        "timestamp", "user",
        "id",
        "fio_old", "department_old", "scheduleType_old", "categoryCode_old", "kpiSum_old",
        "fio_new", "department_new", "scheduleType_new", "categoryCode_new", "kpiSum_new",
    ])
    _ensure_file(RESTORED_FILE, [
        "timestamp", "user",
        "id_new", "fio", "kpiSum", "scheduleType", "department", "categoryCode",
        "source_deleted_timestamp", "source_deleted_by", "source_deleted_reason"
    ])

    if not os.path.exists(USERS_FILE):
        df_users = pd.DataFrame([
            {"login": "admin-nnmc", "password": "123nnmc", "role": "admin"}
        ])
        df_users.to_excel(USERS_FILE, index=False)


def load_kpi_table():
    """
    Возвращает список словарей для расчёта KPI.
    """
    ensure_all_files()
    df = pd.read_excel(KPI_FILE)
    records = []
    for _, row in df.iterrows():
        fio = str(row.get("fio", "")).strip()
        if not fio:
            continue
        rec = {
            "id": int(row.get("id", 0)) if not pd.isna(row.get("id", 0)) else 0,
            "fio": fio,
            "kpiSum": float(row.get("kpiSum", 0) or 0),
            "scheduleType": str(row.get("scheduleType", "")).strip() or "day",
            "department": str(row.get("department", "")).strip(),
            "categoryCode": str(row.get("categoryCode", "")).strip(),
        }
        records.append(rec)
    return records


def load_kpi_df():
    ensure_all_files()
    return pd.read_excel(KPI_FILE)


def save_kpi_df(df: pd.DataFrame):
    df.to_excel(KPI_FILE, index=False)


def log_added(user: str, rec: dict, details: str = ""):
    ensure_all_files()
    df = pd.read_excel(ADDED_FILE)
    ts = datetime.now().isoformat(sep=" ", timespec="seconds")
    row = {
        "timestamp": ts,
        "user": user,
        "id": rec.get("id"),
        "fio": rec.get("fio"),
        "kpiSum": rec.get("kpiSum"),
        "scheduleType": rec.get("scheduleType"),
        "department": rec.get("department"),
        "categoryCode": rec.get("categoryCode"),
        "details": details,
    }
    df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    df.to_excel(ADDED_FILE, index=False)


def log_deleted(user: str, rec: dict, reason: str):
    ensure_all_files()
    df = pd.read_excel(DELETED_FILE)
    ts = datetime.now().isoformat(sep=" ", timespec="seconds")
    row = {
        "timestamp": ts,
        "user": user,
        "id": rec.get("id"),
        "fio": rec.get("fio"),
        "kpiSum": rec.get("kpiSum"),
        "scheduleType": rec.get("scheduleType"),
        "department": rec.get("department"),
        "categoryCode": rec.get("categoryCode"),
        "reason": reason,
    }
    df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    df.to_excel(DELETED_FILE, index=False)


def log_edited(user: str, old: dict, new: dict):
    ensure_all_files()
    df = pd.read_excel(EDITED_FILE)
    ts = datetime.now().isoformat(sep=" ", timespec="seconds")
    row = {
        "timestamp": ts,
        "user": user,
        "id": new.get("id", old.get("id")),
        "fio_old": old.get("fio"),
        "department_old": old.get("department"),
        "scheduleType_old": old.get("scheduleType"),
        "categoryCode_old": old.get("categoryCode"),
        "kpiSum_old": old.get("kpiSum"),
        "fio_new": new.get("fio"),
        "department_new": new.get("department"),
        "scheduleType_new": new.get("scheduleType"),
        "categoryCode_new": new.get("categoryCode"),
        "kpiSum_new": new.get("kpiSum"),
    }
    df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    df.to_excel(EDITED_FILE, index=False)


def log_restored(user: str, rec: dict, source_deleted: dict):
    ensure_all_files()
    df = pd.read_excel(RESTORED_FILE)
    ts = datetime.now().isoformat(sep=" ", timespec="seconds")
    row = {
        "timestamp": ts,
        "user": user,
        "id_new": rec.get("id"),
        "fio": rec.get("fio"),
        "kpiSum": rec.get("kpiSum"),
        "scheduleType": rec.get("scheduleType"),
        "department": rec.get("department"),
        "categoryCode": rec.get("categoryCode"),
        "source_deleted_timestamp": source_deleted.get("timestamp"),
        "source_deleted_by": source_deleted.get("user"),
        "source_deleted_reason": source_deleted.get("reason"),
    }
    df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    df.to_excel(RESTORED_FILE, index=False)


def add_employee(user: str, fio: str, kpiSum: float, scheduleType: str, department: str, categoryCode: str = ""):
    ensure_all_files()
    df = load_kpi_df()

    existing = df[df["fio"].astype(str).str.strip().str.lower() == fio.strip().lower()]
    if not existing.empty:
        raise ValueError("Сотрудник с таким ФИО уже существует.")

    if df.empty:
        new_id = 1
    else:
        new_id = int(df["id"].max()) + 1

    rec = {
        "id": new_id,
        "fio": fio.strip(),
        "kpiSum": float(kpiSum),
        "scheduleType": scheduleType.strip(),
        "department": department.strip(),
        "categoryCode": str(categoryCode or "").strip(),
    }

    df = pd.concat([df, pd.DataFrame([rec])], ignore_index=True)
    save_kpi_df(df)
    log_added(user, rec, details="created")
    return rec


def edit_employee(user: str, emp_id: int, fio: str = None, department: str = None,
                  scheduleType: str = None, categoryCode: str = None, kpiSum=None, allow_kpi_edit: bool = False):
    ensure_all_files()
    df = load_kpi_df()
    if df.empty:
        raise ValueError("Таблица KPI пуста.")

    mask = df["id"] == emp_id
    if mask.sum() == 0:
        raise ValueError("Сотрудник с таким id не найден.")

    row = df[mask].iloc[0].to_dict()
    old = {
        "id": row.get("id"),
        "fio": row.get("fio"),
        "kpiSum": row.get("kpiSum"),
        "scheduleType": row.get("scheduleType"),
        "department": row.get("department"),
        "categoryCode": row.get("categoryCode"),
    }

    if fio is not None:
        df.loc[mask, "fio"] = fio.strip()
    if department is not None:
        df.loc[mask, "department"] = department.strip()
    if scheduleType is not None:
        df.loc[mask, "scheduleType"] = scheduleType.strip()
    if categoryCode is not None:
        df.loc[mask, "categoryCode"] = str(categoryCode).strip()
    if allow_kpi_edit and (kpiSum is not None):
        df.loc[mask, "kpiSum"] = float(kpiSum)

    save_kpi_df(df)

    new_row = df[mask].iloc[0].to_dict()
    new = {
        "id": new_row.get("id"),
        "fio": new_row.get("fio"),
        "kpiSum": new_row.get("kpiSum"),
        "scheduleType": new_row.get("scheduleType"),
        "department": new_row.get("department"),
        "categoryCode": new_row.get("categoryCode"),
    }
    log_edited(user, old, new)
    return new


def delete_employee(user: str, emp_id: int, reason: str):
    ensure_all_files()
    df = load_kpi_df()
    if df.empty:
        raise ValueError("Таблица KPI пуста.")

    mask = df["id"] == emp_id
    if mask.sum() == 0:
        raise ValueError("Сотрудник с таким id не найден.")

    row = df[mask].iloc[0].to_dict()
    rec = {
        "id": row.get("id"),
        "fio": row.get("fio"),
        "kpiSum": row.get("kpiSum"),
        "scheduleType": row.get("scheduleType"),
        "department": row.get("department"),
        "categoryCode": row.get("categoryCode"),
    }

    df = df[~mask]
    save_kpi_df(df)
    log_deleted(user, rec, reason)
    return rec


def load_users():
    ensure_all_files()
    df = pd.read_excel(USERS_FILE)
    users = []
    for _, row in df.iterrows():
        login = str(row.get("login", "")).strip()
        if not login:
            continue
        users.append({
            "login": login,
            "password": str(row.get("password", "")).strip(),
            "role": str(row.get("role", "user")).strip() or "user",
        })
    return users


def save_users(users: list):
    """Сохраняет список пользователей в Excel файл"""
    ensure_all_files()
    df = pd.DataFrame(users)
    df.to_excel(USERS_FILE, index=False)


def load_deleted_log():
    ensure_all_files()
    return pd.read_excel(DELETED_FILE)


def load_edited_log():
    ensure_all_files()
    return pd.read_excel(EDITED_FILE)


def load_restored_log():
    ensure_all_files()
    return pd.read_excel(RESTORED_FILE)
