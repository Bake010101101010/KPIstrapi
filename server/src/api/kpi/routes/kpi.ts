export default {
  routes: [
    {
      method: 'GET',
      path: '/kpi-list',
      handler: 'kpi.list',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/kpi-add',
      handler: 'kpi.add',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/kpi-edit',
      handler: 'kpi.edit',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/kpi-delete',
      handler: 'kpi.remove',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/kpi-restore',
      handler: 'kpi.restore',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'GET',
      path: '/kpi-deleted-log',
      handler: 'kpi.deletedLog',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'GET',
      path: '/kpi-edited-log',
      handler: 'kpi.editedLog',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'GET',
      path: '/kpi-restored-log',
      handler: 'kpi.restoredLog',
      config: {
        auth: { scope: [] },
      },
    },
  ],
};

