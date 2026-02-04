export default {
  routes: [
    {
      method: 'GET',
      path: '/department-access/users',
      handler: 'department-access.listUsers',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/department-access/update',
      handler: 'department-access.updateUser',
      config: {
        auth: { scope: [] },
      },
    },
  ],
};
