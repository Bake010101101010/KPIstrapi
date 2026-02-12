export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: [
        'http://192.168.101.25:13007',
        'http://192.168.101.25:13000',
        'http://localhost:13007',
        'http://127.0.0.1:13007',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ],
      credentials: true,
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
