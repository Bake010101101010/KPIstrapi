"""
Улучшенный калькулятор KPI с гибкой логикой и полной типизацией
"""
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from datetime import date
import logging

from calendar_manager import calendar_manager

logger = logging.getLogger(__name__)


@dataclass
class EmployeeData:
    """Данные сотрудника из табеля"""
    fio: str
    letters_weekday: int = 0
    letters_sat: int = 0
    letters_sun: int = 0
    letters_holiday: int = 0
    numbers_weekday: int = 0
    numbers_sat: int = 0
    numbers_sun: int = 0
    numbers_holiday: int = 0
    worked_days_total: Optional[float] = None


@dataclass
class KPIInfo:
    """Информация о KPI сотрудника"""
    id: int
    fio: str
    kpi_sum: float
    schedule_type: str  # 'day' или 'shift'
    department: str
    category_code: str


@dataclass
class KPIResult:
    """Результат расчета KPI"""
    fio: str
    schedule_type: str
    days_assigned: int
    days_worked: float
    not_worked: int
    letters_weekday: int
    letters_sat: int
    letters_sun: int
    letters_holiday: int
    numbers_weekday: int
    numbers_sat: int
    numbers_sun: int
    numbers_holiday: int
    work_percent: float
    kpi_sum: float
    kpi_final: float
    department: str
    category_code: str


@dataclass
class KPIError:
    """Ошибка при расчете KPI"""
    fio: str
    type: str
    details: str


class KPICalculator:
    """Калькулятор KPI с гибкой логикой"""
    
    def __init__(self, year: int, month: int):
        self.year = year
        self.month = month
        self.holidays = calendar_manager.get_holidays(year, month)
    
    def calculate(
        self,
        employees: List[EmployeeData],
        kpi_table: List[Dict],
        nch_day: int,
        nd_shift: int
    ) -> Tuple[List[KPIResult], List[KPIError]]:
        """
        Рассчитывает KPI для всех сотрудников
        
        Args:
            employees: Список сотрудников из табеля
            kpi_table: Справочник KPI
            nch_day: Норма дней для дневных сотрудников
            nd_shift: Норма дней для суточных сотрудников
        
        Returns:
            Кортеж (результаты, ошибки)
        """
        # Создаем карту ФИО -> KPI информация
        kpi_map = self._build_kpi_map(kpi_table)
        
        results = []
        errors = []
        seen_fios = set()
        
        for emp in employees:
            fio = emp.fio.strip()
            if not fio:
                continue
            
            fio_key = fio.lower()
            
            # Проверка на дубликаты
            if fio_key in seen_fios:
                errors.append(KPIError(
                    fio=fio,
                    type="DUPLICATE",
                    details="ФИО повторяется в табеле"
                ))
                continue
            seen_fios.add(fio_key)
            
            # Получаем информацию о KPI
            kpi_info = kpi_map.get(fio_key)
            if not kpi_info:
                errors.append(KPIError(
                    fio=fio,
                    type="NO_KPI_MAPPING",
                    details="Нет записи в KPI таблице"
                ))
                continue
            
            # Исключаем студентов (categoryCode == "4")
            if kpi_info.category_code.strip() == "4":
                errors.append(KPIError(
                    fio=fio,
                    type="STUDENT",
                    details="CategoryCode = 4 (студент), KPI не считается"
                ))
                continue
            
            # Рассчитываем KPI в зависимости от графика
            try:
                if kpi_info.schedule_type.lower() == "day":
                    result = self._calculate_day_kpi(emp, kpi_info, nch_day)
                else:
                    result = self._calculate_shift_kpi(emp, kpi_info, nd_shift)
                
                if result:
                    results.append(result)
            except Exception as e:
                logger.error(f"Ошибка расчета KPI для {fio}: {e}")
                errors.append(KPIError(
                    fio=fio,
                    type="CALCULATION_ERROR",
                    details=f"Ошибка расчета: {str(e)}"
                ))
        
        return results, errors
    
    def _build_kpi_map(self, kpi_table: List[Dict]) -> Dict[str, KPIInfo]:
        """Создает карту ФИО -> KPI информация"""
        kpi_map = {}
        for item in kpi_table:
            fio = str(item.get("fio", "")).strip()
            if not fio:
                continue
            
            try:
                kpi_info = KPIInfo(
                    id=int(item.get("id", 0)) if item.get("id") else 0,
                    fio=fio,
                    kpi_sum=float(item.get("kpiSum", 0) or 0),
                    schedule_type=str(item.get("scheduleType", "")).strip().lower() or "day",
                    department=str(item.get("department", "")).strip(),
                    category_code=str(item.get("categoryCode", "")).strip()
                )
                kpi_map[fio.lower()] = kpi_info
            except Exception as e:
                logger.warning(f"Ошибка обработки записи KPI для {fio}: {e}")
        
        return kpi_map
    
    def _calculate_day_kpi(
        self,
        emp: EmployeeData,
        kpi_info: KPIInfo,
        days_assigned: int
    ) -> Optional[KPIResult]:
        """Рассчитывает KPI для дневных сотрудников"""
        if days_assigned <= 0:
            return None
        
        # Н.о (не отработано) = буквы в будни
        not_worked = emp.letters_weekday
        
        # Определяем фактически отработанные дни
        if emp.worked_days_total is not None:
            # Используем значение из табеля (надежнее)
            try:
                days_worked = float(emp.worked_days_total)
            except (ValueError, TypeError):
                days_worked = days_assigned - not_worked
        else:
            # Рассчитываем: назначено - не отработано
            days_worked = days_assigned - not_worked
        
        # Нормализация
        days_worked = max(0, min(days_worked, days_assigned))
        
        # Процент выполнения
        work_percent = (days_worked * 100.0) / days_assigned if days_assigned > 0 else 0.0
        work_percent = max(0.0, min(100.0, work_percent))
        
        # Итоговый KPI
        kpi_final = (work_percent / 100.0) * kpi_info.kpi_sum
        
        return KPIResult(
            fio=emp.fio,
            schedule_type="day",
            days_assigned=days_assigned,
            days_worked=round(days_worked, 2),
            not_worked=max(days_assigned - days_worked, 0),
            letters_weekday=emp.letters_weekday,
            letters_sat=emp.letters_sat,
            letters_sun=emp.letters_sun,
            letters_holiday=emp.letters_holiday,
            numbers_weekday=emp.numbers_weekday,
            numbers_sat=emp.numbers_sat,
            numbers_sun=emp.numbers_sun,
            numbers_holiday=emp.numbers_holiday,
            work_percent=round(work_percent, 2),
            kpi_sum=kpi_info.kpi_sum,
            kpi_final=round(kpi_final, 2),
            department=kpi_info.department,
            category_code=kpi_info.category_code
        )
    
    def _calculate_shift_kpi(
        self,
        emp: EmployeeData,
        kpi_info: KPIInfo,
        days_assigned: int
    ) -> Optional[KPIResult]:
        """Рассчитывает KPI для суточных сотрудников"""
        if days_assigned <= 0:
            return None
        
        # Н.о = буквы в будни + буквы в субботу
        # Буквы в воскресенье/праздники не считаем
        effective_not_worked = emp.letters_weekday + emp.letters_sat
        
        # Отработанные дни
        days_worked = days_assigned - effective_not_worked
        days_worked = max(0, min(days_worked, days_assigned))
        
        # Процент выполнения
        work_percent = (days_worked * 100.0) / days_assigned if days_assigned > 0 else 0.0
        work_percent = max(0.0, min(100.0, work_percent))
        
        # Итоговый KPI
        kpi_final = (work_percent / 100.0) * kpi_info.kpi_sum
        
        return KPIResult(
            fio=emp.fio,
            schedule_type="shift",
            days_assigned=days_assigned,
            days_worked=round(days_worked, 2),
            not_worked=effective_not_worked,
            letters_weekday=emp.letters_weekday,
            letters_sat=emp.letters_sat,
            letters_sun=emp.letters_sun,
            letters_holiday=emp.letters_holiday,
            numbers_weekday=emp.numbers_weekday,
            numbers_sat=emp.numbers_sat,
            numbers_sun=emp.numbers_sun,
            numbers_holiday=emp.numbers_holiday,
            work_percent=round(work_percent, 2),
            kpi_sum=kpi_info.kpi_sum,
            kpi_final=round(kpi_final, 2),
            department=kpi_info.department,
            category_code=kpi_info.category_code
        )


def calculate_kpi_for_employees(
    employees: List[Dict],
    kpi_table: List[Dict],
    nch_day: int,
    nd_shift: int,
    year: int,
    month: int
) -> Tuple[List[Dict], List[Dict]]:
    """
    Улучшенная функция расчета KPI (совместимость со старым API)
    
    Returns:
        Кортеж (результаты как dict, ошибки как dict)
    """
    # Конвертируем входные данные
    employee_data = []
    for emp in employees:
        employee_data.append(EmployeeData(
            fio=str(emp.get("fio", "")).strip(),
            letters_weekday=int(emp.get("letters_weekday", 0) or 0),
            letters_sat=int(emp.get("letters_sat", 0) or 0),
            letters_sun=int(emp.get("letters_sun", 0) or 0),
            letters_holiday=int(emp.get("letters_holiday", 0) or 0),
            numbers_weekday=int(emp.get("numbers_weekday", 0) or 0),
            numbers_sat=int(emp.get("numbers_sat", 0) or 0),
            numbers_sun=int(emp.get("numbers_sun", 0) or 0),
            numbers_holiday=int(emp.get("numbers_holiday", 0) or 0),
            worked_days_total=emp.get("workedDaysTotal")
        ))
    
    # Рассчитываем
    calculator = KPICalculator(year, month)
    results, errors = calculator.calculate(employee_data, kpi_table, nch_day, nd_shift)
    
    # Конвертируем результаты в dict
    results_dict = [
        {
            "fio": r.fio,
            "scheduleType": r.schedule_type,
            "daysAssigned": r.days_assigned,
            "daysWorked": r.days_worked,
            "notWorked": r.not_worked,
            "lettersWeekday": r.letters_weekday,
            "lettersSat": r.letters_sat,
            "lettersSun": r.letters_sun,
            "lettersHoliday": r.letters_holiday,
            "numbersWeekday": r.numbers_weekday,
            "numbersSat": r.numbers_sat,
            "numbersSun": r.numbers_sun,
            "numbersHoliday": r.numbers_holiday,
            "workPercent": r.work_percent,
            "kpiSum": r.kpi_sum,
            "kpiFinal": r.kpi_final,
            "department": r.department,
            "categoryCode": r.category_code
        }
        for r in results
    ]
    
    errors_dict = [
        {
            "fio": e.fio,
            "type": e.type,
            "details": e.details
        }
        for e in errors
    ]
    
    return results_dict, errors_dict

