export default {
  routes: [
    {
      method: 'GET',
      path: '/kpi-list',
      handler: 'kpi.list',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/kpi-add',
      handler: 'kpi.add',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/kpi-edit',
      handler: 'kpi.edit',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/kpi-delete',
      handler: 'kpi.remove',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/kpi-restore',
      handler: 'kpi.restore',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/kpi-deleted-log',
      handler: 'kpi.deletedLog',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/kpi-edited-log',
      handler: 'kpi.editedLog',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/kpi-restored-log',
      handler: 'kpi.restoredLog',
      config: {
        auth: false,
      },
    },
  ],
};

