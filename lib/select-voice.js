const config = require('config');

module.exports = function(opts) {
  if (opts.req.callingNumber.startsWith(1)) opts.voice = config.get('voices.us');
  opts.voice = config.get('voices.uk');

  return Promise.resolve(opts);
};
