const config = require('config');
const defaultCallerId =  `<sip:${config.get('outbound.caller-id')}@voxbone.com>`;

module.exports = function(tn) {
  if (!tn) return defaultCallerId;

  const dest = tn.startsWith('+') ? tn.slice(1) : tn;

  const cids = config.get('caller-id');
  const countryCode = Object.keys(cids).find((cc) => dest.startsWith(cc));

  return countryCode ? `<sip:${cids[countryCode]}@voxbone.com>` : defaultCallerId;
};
