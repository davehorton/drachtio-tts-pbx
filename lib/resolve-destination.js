const config = require('config');
const moment = require('moment');
const groups = config.get('groups');

module.exports = function(opts) {
  if (opts.digits.length === 4) {
    return Object.assign(opts, {dest: [`sip:${opts.digits}@sipvox1.voxbone.com`]});
  }

  switch (opts.digits) {
    case '1':
      return Object.assign(opts, {dest: resolveSales(opts.req.callingNumber)});

    case '2':
      return Object.assign(opts, {dest: groups['am-uk']});

    case '3':
      return Object.assign(opts, {dest: resolveSupport(opts.req.callingNumber)});
  }
};

function resolveSales(callingNumber) {
  const hours = moment().hour();
  const min = moment().minute();
  let office = 'be';

  if (callingNumber.startsWith(1)) office = 'us';
  else if (hours > 15 && min > 30) office = 'us';

  return groups[`sales-${office}`];
}

function resolveSupport(callingNumber) {
  const hours = moment().hour();
  const min = moment().minute();
  let office = 'be';

  if (callingNumber.startsWith(1)) office = 'us';
  else if (callingNumber.startsWith(44)) office = 'uk';
  else if (hours > 15 && min > 30) office = 'us';

  return groups[`support-${office}`];
}
