"""
Улучшенная система аутентификации с хешированием паролей
"""
import secrets
import hashlib
from typing import Optional, Dict
from datetime import datetime, timedelta
import logging

from kpi_storage import load_users, save_users
from config import Config

logger = logging.getLogger(__name__)

# Сессии в памяти (в продакшене использовать Redis)
SESSIONS: Dict[str, Dict] = {}


def hash_password(password: str) -> str:
    """
    Хеширует пароль с солью
    Формат: salt:hash
    """
    salt = secrets.token_hex(Config.PASSWORD_SALT_LENGTH)
    password_hash = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{password_hash}"


def verify_password(password: str, password_hash: str) -> bool:
    """Проверяет пароль против хеша"""
    try:
        if ':' not in password_hash:
            # Старый формат (без хеширования) - для миграции
            return password == password_hash
        
        salt, hash_part = password_hash.split(':', 1)
        computed_hash = hashlib.sha256((salt + password).encode()).hexdigest()
        return computed_hash == hash_part
    except Exception as e:
        logger.error(f"Ошибка проверки пароля: {e}")
        return False


def authenticate(login: str, password: str) -> Optional[Dict]:
    """
    Аутентифицирует пользователя
    
    Returns:
        dict с login и role или None
    """
    users = load_users()
    login_lower = login.strip().lower()
    
    for user in users:
        if user["login"].strip().lower() == login_lower:
            if verify_password(password, user["password"]):
                return {
                    "login": user["login"],
                    "role": user["role"]
                }
            else:
                logger.warning(f"Неверный пароль для пользователя: {login}")
                return None
    
    logger.warning(f"Пользователь не найден: {login}")
    return None


def create_session(user: Dict) -> str:
    """Создает сессию и возвращает токен"""
    token = secrets.token_hex(32)
    expires_at = datetime.now() + timedelta(seconds=Config.SESSION_TIMEOUT)
    
    SESSIONS[token] = {
        "user": user,
        "created_at": datetime.now().isoformat(),
        "expires_at": expires_at.isoformat()
    }
    
    logger.info(f"Создана сессия для пользователя: {user['login']}")
    return token


def get_user_by_token(token: str) -> Optional[Dict]:
    """Получает пользователя по токену (с проверкой срока действия)"""
    if not token:
        return None
    
    session = SESSIONS.get(token)
    if not session:
        return None
    
    # Проверка срока действия
    try:
        expires_at = datetime.fromisoformat(session["expires_at"])
        if datetime.now() > expires_at:
            logger.info(f"Сессия истекла для токена: {token[:8]}...")
            del SESSIONS[token]
            return None
    except Exception as e:
        logger.error(f"Ошибка проверки срока действия сессии: {e}")
        return None
    
    return session["user"]


def require_auth_from_request(req) -> Optional[Dict]:
    """
    Извлекает и проверяет токен из запроса
    
    Returns:
        dict с данными пользователя или None
    """
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    
    token = auth_header[7:].strip()
    if not token:
        return None
    
    return get_user_by_token(token)


def cleanup_expired_sessions():
    """Удаляет истекшие сессии (вызывать периодически)"""
    now = datetime.now()
    expired_tokens = []
    
    for token, session in SESSIONS.items():
        try:
            expires_at = datetime.fromisoformat(session["expires_at"])
            if now > expires_at:
                expired_tokens.append(token)
        except Exception:
            expired_tokens.append(token)
    
    for token in expired_tokens:
        del SESSIONS[token]
    
    if expired_tokens:
        logger.info(f"Удалено истекших сессий: {len(expired_tokens)}")


def migrate_passwords():
    """Мигрирует пароли в новый формат (однократный запуск)"""
    users = load_users()
    updated = False
    
    for user in users:
        password = user.get("password", "")
        # Если пароль не в формате salt:hash, хешируем его
        if ':' not in password:
            user["password"] = hash_password(password)
            updated = True
            logger.info(f"Мигрирован пароль для: {user['login']}")
    
    if updated:
        save_users(users)
        logger.info("Миграция паролей завершена")

