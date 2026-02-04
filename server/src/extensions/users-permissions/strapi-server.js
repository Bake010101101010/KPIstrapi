'use strict';

module.exports = (plugin) => {
  const attributes = plugin.contentTypes.user.schema.attributes;

  if (!attributes.allowedDepartments) {
    attributes.allowedDepartments = {
      type: 'json',
      default: [],
    };
  }

  return plugin;
};
