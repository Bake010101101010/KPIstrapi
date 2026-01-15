"""
Конфигурация приложения
"""
import os
from pathlib import Path
from typing import Optional

class Config:
    """Конфигурация приложения"""
    
    # Базовые пути
    BASE_DIR = Path(__file__).parent
    DATA_DIR = BASE_DIR / "data"
    LOGS_DIR = BASE_DIR / "logs"
    
    # Файлы данных
    KPI_FILE = DATA_DIR / "KPIsum_dynamic.xlsx"
    USERS_FILE = DATA_DIR / "users.xlsx"
    HOLIDAYS_FILE = DATA_DIR / "holidays.json"
    CALENDAR_FILE = DATA_DIR / "calendar.json"
    
    # Логи
    ADDED_LOG = DATA_DIR / "KPI_added_log.xlsx"
    DELETED_LOG = DATA_DIR / "KPI_deleted_log.xlsx"
    EDITED_LOG = DATA_DIR / "KPI_edited_log.xlsx"
    RESTORED_LOG = DATA_DIR / "KPI_restored_log.xlsx"
    
    # Безопасность
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
    SESSION_TIMEOUT = int(os.getenv("SESSION_TIMEOUT", 3600))  # 1 час
    PASSWORD_SALT_LENGTH = 16
    
    # Ограничения
    MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 10 * 1024 * 1024))  # 10MB
    MAX_EMPLOYEES = int(os.getenv("MAX_EMPLOYEES", 10000))
    
    # API
    API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
    
    # KPI настройки
    DEFAULT_KPI_SUM = float(os.getenv("DEFAULT_KPI_SUM", 15000))
    MIN_YEAR = 2000
    MAX_YEAR = 2100
    
    # Логирование
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE = LOGS_DIR / "app.log"
    
    @classmethod
    def ensure_directories(cls):
        """Создает необходимые директории"""
        cls.DATA_DIR.mkdir(exist_ok=True)
        cls.LOGS_DIR.mkdir(exist_ok=True)

