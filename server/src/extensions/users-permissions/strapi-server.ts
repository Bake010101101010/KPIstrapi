type Plugin = {
  contentTypes?: {
    user?: {
      schema?: {
        attributes?: Record<string, any>;
      };
    };
  };
};

export default (plugin: Plugin) => {
  const attributes =
    plugin?.contentTypes?.user?.schema?.attributes || ({} as Record<string, any>);

  if (!attributes.allowedDepartments) {
    attributes.allowedDepartments = {
      type: 'json',
      default: [],
    };
  }

  if (plugin?.contentTypes?.user?.schema) {
    plugin.contentTypes.user.schema.attributes = attributes;
  }

  return plugin;
};
