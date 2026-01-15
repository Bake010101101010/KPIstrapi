export default {
  routes: [
    {
      method: 'POST',
      path: '/kpi-calculator/calculate',
      handler: 'kpi-calculator.calculate',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/kpi-calculator/download-excel',
      handler: 'kpi-calculator.downloadExcel',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/kpi-calculator/download-1c',
      handler: 'kpi-calculator.download1C',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/kpi-calculator/download-buh',
      handler: 'kpi-calculator.downloadBuh',
      config: {
        auth: false,
      },
    },
  ],
};

