const config = require('config');
const moment = require('moment');
const groups = config.get('groups');

module.exports = function(logger, digits, req) {
  const hours = moment().hour();
  const min = moment().minute();
  const dow = moment().day();
  let office;

  if (dow === 0 || dow === 6) {
    logger.info('weekend call -- will be diverted to voicemail');
    return [];
  }

  logger.debug(`time of day: ${hours}:${min}`);
  if (hours >= 8 && hours < 17) office = 'eu';
  else if (hours >= 17 || hours < 1) office = 'us';
  else return []; // voicemail

  switch (digits) {
    case '1':
    case '3':
      return removeInactives(logger, groups[`sales-${office}`]);

    case '2':
      return removeInactives(logger, groups[`am-${office}`]);

    case '4':
      return removeInactives(logger, groups['test']);

    case '3228': return removeInactives(logger, [
      {
        strategy: 'hunt',
        members: ['dhorton']
      }
    ]);

    case '3229': return removeInactives(logger, [
      {
        strategy: 'hunt',
        members: ['ffirat']
      }
    ]);

    default:
      if (digits.length === 4) return [
        {
          strategy: 'hunt',
          members: [`sip:${digits}@sipvox1.voxbone.com`]
        }
      ];
  }
};

function removeInactives(logger, group) {

  // filter out inactive members
  for (const level of group) {
    level.members = level.members.filter((m) => {
      try {
        return !(config.get(`people.${m}.active`) === false);
      } catch (err) {
        return true;
      }
    });
  }

  //remove any levels that now have no members
  const g = group.filter((level) => level.members.length);

  logger.debug(`after removing inactives the target group is ${JSON.stringify(g)}`);

  return g;
}
