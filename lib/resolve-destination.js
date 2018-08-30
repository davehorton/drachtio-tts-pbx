const config = require('config');
const moment = require('moment');
const groups = config.get('groups');

module.exports = function(logger, digits, req) {
  const hours = moment().hour();
  const min = moment().minute();
  let office;

  logger.debug(`time of day: ${hours}:${min}`);
  if (hours >= 7 && hours < 17) office = 'eu';
  else if (hours >= 17 || hours < 1) office = 'us';
  else return []; // voicemail

  switch (digits) {
    case '1':
    case '3':
      return groups[`sales-${office}`];

    case '2':
      return groups[`am-${office}`];

    case '3228': return [
      {
        strategy: 'hunt',
        members: ['dhorton']
      }
    ];

    case '3229': return [
      {
        strategy: 'hunt',
        members: ['ffirat']
      }
    ];

    default:
      if (digits.length === 4) return [
        {
          strategy: 'hunt',
          members: [`sip:${digits}@sipvox1.voxbone.com`]
        }
      ];
  }
};
