"""
Модуль управления календарем и праздничными днями
"""
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import List, Set, Optional, Dict
import logging

from config import Config

logger = logging.getLogger(__name__)


class CalendarManager:
    """Управление календарем, праздниками и выходными"""
    
    def __init__(self):
        self.holidays_file = Config.HOLIDAYS_FILE
        self.calendar_file = Config.CALENDAR_FILE
        self._holidays_cache: Optional[Set[date]] = None
        self._load_holidays()
    
    def _load_holidays(self) -> None:
        """Загружает праздничные дни из файла"""
        try:
            if self.holidays_file.exists():
                with open(self.holidays_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    holidays = set()
                    for holiday_str in data.get('holidays', []):
                        try:
                            holiday_date = datetime.strptime(holiday_str, '%Y-%m-%d').date()
                            holidays.add(holiday_date)
                        except ValueError:
                            logger.warning(f"Неверный формат даты: {holiday_str}")
                    self._holidays_cache = holidays
            else:
                self._holidays_cache = set()
                self._save_holidays()
        except Exception as e:
            logger.error(f"Ошибка загрузки праздников: {e}")
            self._holidays_cache = set()
    
    def _save_holidays(self) -> None:
        """Сохраняет праздничные дни в файл"""
        try:
            Config.ensure_directories()
            holidays_list = sorted([d.isoformat() for d in self._holidays_cache])
            data = {'holidays': holidays_list, 'updated': datetime.now().isoformat()}
            with open(self.holidays_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Ошибка сохранения праздников: {e}")
    
    def add_holiday(self, holiday_date: date) -> bool:
        """Добавляет праздничный день"""
        if holiday_date not in self._holidays_cache:
            self._holidays_cache.add(holiday_date)
            self._save_holidays()
            return True
        return False
    
    def remove_holiday(self, holiday_date: date) -> bool:
        """Удаляет праздничный день"""
        if holiday_date in self._holidays_cache:
            self._holidays_cache.remove(holiday_date)
            self._save_holidays()
            return True
        return False
    
    def get_holidays(self, year: Optional[int] = None, month: Optional[int] = None) -> Set[date]:
        """Возвращает праздничные дни (опционально фильтрует по году/месяцу)"""
        if year is None and month is None:
            return self._holidays_cache.copy()
        
        filtered = set()
        for holiday in self._holidays_cache:
            if year is not None and holiday.year != year:
                continue
            if month is not None and holiday.month != month:
                continue
            filtered.add(holiday)
        return filtered
    
    def is_holiday(self, check_date: date) -> bool:
        """Проверяет, является ли дата праздничным днем"""
        return check_date in self._holidays_cache
    
    def get_day_type(self, check_date: date) -> str:
        """
        Определяет тип дня:
        - 'workday' - рабочий день
        - 'weekend' - выходной (суббота/воскресенье)
        - 'holiday' - праздничный день
        """
        if self.is_holiday(check_date):
            return 'holiday'
        
        weekday = check_date.weekday()  # 0=Пн, 6=Вс
        if weekday >= 5:  # Суббота или воскресенье
            return 'weekend'
        
        return 'workday'
    
    def get_workdays_in_month(self, year: int, month: int) -> int:
        """Возвращает количество рабочих дней в месяце"""
        workdays = 0
        first_day = date(year, month, 1)
        
        # Определяем последний день месяца
        if month == 12:
            last_day = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            last_day = date(year, month + 1, 1) - timedelta(days=1)
        
        current = first_day
        while current <= last_day:
            day_type = self.get_day_type(current)
            if day_type == 'workday':
                workdays += 1
            current += timedelta(days=1)
        
        return workdays
    
    def get_days_in_month(self, year: int, month: int) -> List[Dict]:
        """Возвращает список всех дней месяца с их типами"""
        days = []
        first_day = date(year, month, 1)
        
        if month == 12:
            last_day = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            last_day = date(year, month + 1, 1) - timedelta(days=1)
        
        current = first_day
        while current <= last_day:
            day_type = self.get_day_type(current)
            days.append({
                'date': current.isoformat(),
                'day': current.day,
                'type': day_type,
                'weekday': current.weekday(),
                'is_weekend': day_type in ('weekend', 'holiday')
            })
            current += timedelta(days=1)
        
        return days


# Глобальный экземпляр
calendar_manager = CalendarManager()

