import React from 'react'

export default function EmployeeTable({ data, filterSchedule }) {
  if (!data || data.length === 0) return null

  const filtered = filterSchedule
    ? data.filter((row) => row.scheduleType === filterSchedule)
    : data

  return (
    <table
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        marginTop: '16px',
      }}
    >
      <thead>
        <tr>
          <th style={th}>ФИО</th>
          <th style={th}>Тип</th>
          <th style={th}>План</th>
          <th style={th}>Факт</th>
          <th style={th}>Неотраб.</th>
          <th style={th}>%</th>
          <th style={th}>KPI сумм</th>
          <th style={th}>KPI итог</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((row) => (
          <tr key={row.fio}>
            <td style={td}>{row.fio}</td>
            <td style={td}>{row.scheduleType}</td>
            <td style={td}>{row.daysAssigned}</td>
            <td style={td}>{row.daysWorked}</td>
            <td style={td}>{row.notWorked}</td>
            <td style={td}>{row.workPercent}</td>
            <td style={td}>{row.kpiSum}</td>
            <td style={td}>{row.kpiFinal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const th = {
  border: '1px solid #ccc',
  padding: '8px',
  background: '#f3f4f6',
  textAlign: 'left',
}

const td = {
  border: '1px solid #ddd',
  padding: '8px',
}
