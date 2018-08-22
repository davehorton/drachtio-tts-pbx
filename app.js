const Srf = require('drachtio-srf');
const srf = new Srf();
const Mrf = require('drachtio-fsmrf');
const mrf = new Mrf(srf);
const config = require('config');
const level = config.has('log.level') ? config.get('log.level') : 'info';
const logger = require('pino')({level});
const path = require('path');
const keyfile = path.resolve(__dirname, 'config', 'gcs-service-account.json');
const promptsDir = config.get('prompts-dir');
const synth = require('./lib/synth-prompt')(logger, promptsDir, keyfile);
const inviteHandler = require('./lib/invite')(logger, synth);

function connectMS() {
  return mrf.connect({
    address: config.get('servers.freeswitch.host'),
    port: config.get('servers.freeswitch.port'),
    secret: config.get('servers.freeswitch.secret')
  })
    .then((ms) => {
      logger.info(`successfully connected to media server at ${ms.address}`);
      return ms;
    });
}

function connectHandler(err, hp) {
  logger.info(`connected to drachtio listening on ${hp}`);
  connectMS()
    .then((ms) => srf.locals.ms = ms)
    .catch((err) => logger.error(err, 'error connecting to media server'));
}

srf.connect(config.get('servers.drachtio'))
  .on('connect', connectHandler)
  .on('error', (err) => logger.error(err, 'error connecting to drachtio'));

srf.invite(inviteHandler);
