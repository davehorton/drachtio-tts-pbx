const config = require('config');

module.exports = function(req) {
  return req.callingNumber.startsWith('1') ? config.get('voices.us') : config.get('voices.uk');
};

