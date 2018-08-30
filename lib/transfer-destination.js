const config = require('config');
const predialPrompt = config.get('prompts.predial');
const async = require('async');
const parseUri = require('drachtio-srf').parseUri;

module.exports = function(opts) {
  const {synth, ep, dlg, logger, voice} = opts;
  let connected = false;
  let idx = 0;
  const uris = opts.dest;
  const ruri = parseUri(opts.req.uri);

  return synth(predialPrompt, voice)
    .then(ep.play.bind(ep))
    .then(() => {
      return new Promise((resolve, reject) => {
        async.whilst(
          () => !connected && idx < uris.length,
          (callback) => {
            dlg.request({
              method: 'REFER',
              headers: {
                'Refer-To': uris[idx],
                'Referred-By': `<sip:${ruri.user}@voxbone.com>`,
                'Contact': `<sip:${ruri.user}@142.93.236.112>`
              }
            }, (err, response) => {
              if (err) return callback(err);
              if (response.status === 202) {
                logger.info(`successfully connected to ${uris[idx]}`);
                connected = true;
                return callback(null, uris[idx]);
              }
              idx++;
              callback(null);
            });
          },
          (err, uri) => {
            if (err) return reject(err);
            resolve(uri);
          });
      });
    })
    .then((uri) => {
      if (!uri) {
        logger.info('failed to connect to any configured uris');
        throw new Error('connect failure');
      }
      return new Promise((resolve, reject) => {
        dlg.on('notify', (req, res) => {
          res.send(200);
          const state = req.get('Subscription-State');
          logger.info(`got notify with Subscription-State: ${state}`);
          if (/terminated/.test(state)) resolve(uri);
        });
      });
    })
    .then((uri) => {
      logger.info(`transfer successfully completed to ${uri}`);
      ep.destroy();
      dlg.destroy();
      return Object.assign(opts, {uri: uri});
    });

};
