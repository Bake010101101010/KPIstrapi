"""
Утилиты для валидации и обработки данных
"""
import logging
from functools import wraps
from flask import jsonify, request
from typing import Callable, Any
import os

logger = logging.getLogger(__name__)


def validate_file_size(file, max_size: int = 10 * 1024 * 1024) -> None:
    """
    Валидирует размер файла
    
    Args:
        file: Файловый объект
        max_size: Максимальный размер в байтах
    
    Raises:
        ValueError: Если файл слишком большой
    """
    if not file:
        raise ValueError("Файл не загружен")
    
    # Сохраняем текущую позицию
    current_pos = file.tell()
    
    # Переходим в конец файла
    file.seek(0, os.SEEK_END)
    size = file.tell()
    
    # Возвращаемся на место
    file.seek(current_pos)
    
    if size > max_size:
        size_mb = max_size / (1024 * 1024)
        raise ValueError(f"Файл слишком большой. Максимальный размер: {size_mb}MB")


def validate_file_extension(filename: str, allowed_extensions: tuple = ('.xls', '.xlsx')) -> None:
    """
    Валидирует расширение файла
    
    Args:
        filename: Имя файла
        allowed_extensions: Разрешенные расширения
    
    Raises:
        ValueError: Если расширение не разрешено
    """
    if not filename:
        raise ValueError("Имя файла не указано")
    
    if not filename.lower().endswith(allowed_extensions):
        ext_str = ', '.join(allowed_extensions)
        raise ValueError(f"Поддерживаются только файлы: {ext_str}")


def handle_errors(f: Callable) -> Callable:
    """
    Декоратор для обработки ошибок в API endpoints
    
    Логирует ошибки и возвращает понятные сообщения пользователю
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ValueError as e:
            logger.warning(f"Validation error in {f.__name__}: {e}")
            return jsonify({"error": str(e)}), 400
        except FileNotFoundError as e:
            logger.error(f"File not found in {f.__name__}: {e}")
            return jsonify({"error": "Файл не найден"}), 404
        except PermissionError as e:
            logger.error(f"Permission error in {f.__name__}: {e}")
            return jsonify({"error": "Недостаточно прав доступа"}), 403
        except Exception as e:
            logger.exception(f"Unexpected error in {f.__name__}")
            # В продакшене не показываем детали ошибки
            return jsonify({"error": "Внутренняя ошибка сервера"}), 500
    return wrapper


def sanitize_value(v: Any) -> Any:
    """
    Очищает значение от NaN и None
    
    Args:
        v: Значение для очистки
    
    Returns:
        Очищенное значение
    """
    import math
    if isinstance(v, float) and math.isnan(v):
        return ""
    if v is None:
        return ""
    return v


def sanitize_rows(rows: list) -> list:
    """
    Очищает список словарей от NaN значений
    
    Args:
        rows: Список словарей
    
    Returns:
        Очищенный список
    """
    if not rows:
        return []
    
    clean = []
    for row in rows:
        if not isinstance(row, dict):
            clean.append(row)
            continue
        
        clean_row = {k: sanitize_value(v) for k, v in row.items()}
        clean.append(clean_row)
    
    return clean


def sanitize_record(rec: dict) -> dict:
    """
    Очищает одну запись от NaN значений
    
    Args:
        rec: Словарь с данными
    
    Returns:
        Очищенный словарь
    """
    if rec is None or not isinstance(rec, dict):
        return rec or {}
    
    return {k: sanitize_value(v) for k, v in rec.items()}


def validate_year_month(year: int, month: int) -> None:
    """
    Валидирует год и месяц
    
    Args:
        year: Год
        month: Месяц
    
    Raises:
        ValueError: Если значения некорректны
    """
    from config import Config
    
    if not (Config.MIN_YEAR <= year <= Config.MAX_YEAR):
        raise ValueError(f"Год должен быть между {Config.MIN_YEAR} и {Config.MAX_YEAR}")
    
    if not (1 <= month <= 12):
        raise ValueError("Месяц должен быть от 1 до 12")


def parse_holidays_from_form(req) -> list:
    """
    Парсит праздничные дни из формы запроса
    
    Поддерживает форматы:
    - JSON массив: ["2025-12-16", "2025-12-17"]
    - CSV строка: "16,17" или "16;17"
    
    Args:
        req: Flask request объект
    
    Returns:
        Список дат (строки или числа)
    """
    import json
    
    raw = (req.form.get("holidays") or "").strip()
    if not raw:
        return []
    
    # JSON формат
    if raw.startswith("["):
        try:
            val = json.loads(raw)
            if isinstance(val, list):
                return val
        except Exception:
            pass
    
    # CSV формат
    parts = [p.strip() for p in raw.replace(";", ",").split(",") if p.strip()]
    out = []
    for p in parts:
        if p.isdigit():
            out.append(int(p))
        else:
            out.append(p)
    
    return out

