export default {
  routes: [
    {
      method: 'POST',
      path: '/kpi-calculator/calculate',
      handler: 'kpi-calculator.calculate',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/kpi-calculator/download-excel',
      handler: 'kpi-calculator.downloadExcel',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/kpi-calculator/download-1c',
      handler: 'kpi-calculator.download1C',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/kpi-calculator/download-buh',
      handler: 'kpi-calculator.downloadBuh',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/kpi-calculator/download-buh-pdf',
      handler: 'kpi-calculator.downloadBuhPdf',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/kpi-calculator/download-report',
      handler: 'kpi-calculator.downloadReport',
      config: {
        auth: { scope: [] },
      },
    },
  ],
};

