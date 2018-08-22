const async = require('async');
const config = require('config');
const assert = require('assert');
const parseUri = require('drachtio-srf').parseUri;
const DtmfIntent = require('../lib/intents/dtmf-intent');
const TransferIntent = require('../lib/intents/blind-transfer-intent');
const ivrs = require('../config/ivrs');
let ivr = config.get('ivr.default.entry');
assert(ivr, 'default ivr entry is required and was not found');

module.exports = function(logger, synth) {

  return function(req, res) {
    const ms = req.app.locals.ms;
    const uri = parseUri(req.uri);
    const did = uri.user;

    if (config.has(`did.${did}.entry`)) {
      ivr = config.get(`did.${did}.entry`);
      logger.info(`Executing ivr ${ivr} for call to DID ${did}`);
    }
    else {
      logger.info(`Executing default ivr ${ivr} for call to DID ${did}`);
    }

    ms.connectCaller(req, res)
      .then(doIvr.bind(null, logger, synth, ivr))
      .catch((err) => {
        logger.error(err, 'error connecting call to media server');
        res.send(500);
      });
  };
};

function doIvr(logger, synth, ivr, {endpoint, dialog}) {
  let ivrName = ivr;
  const dlg = dialog;
  const ep = endpoint;

  logger.info({callID: dlg.sip.callId}, 'successfully connected call to media server');

  // release endpoint when caller hangs up
  dlg.on('destroy', () => {
    logger.debug({callID: dlg.sip.callId}, 'got BYE from caller');
    ep.destroy();
  });

  let intent = new DtmfIntent(logger, dlg, ep, synth, ivrs[ivrName]);
  async.whilst(
    () => intent,
    (callback) => {

      intent.exec()
        .on('ivr', (next) => {
          ivrName = next;
          intent = new DtmfIntent(logger, dlg, ep, synth, ivrs[ivrName]);
          callback(null);
        })
        .on('action', (opts) => {
          logger.info(opts, 'got action');
          intent = makeIntent(logger, dlg, ep, synth, opts);
          callback(null);
        })
        .on('bail', () => {
          ep.destroy();
          dlg.destroy();
          intent = null;
          callback(null);
        })
        .on('hangup', () => {
          intent = null;
          callback(null);
        });

    },
    (err) => {
      if (err) return logger.error(err, `Error executing IVR ${ivrName}`);
      logger.info({callID: dlg.sip.callId}, `Finished executing ivr ${ivrName}`);
    }
  );
}

function makeIntent(logger, dlg, ep, synth, opts) {
  switch (opts.action) {
    case 'transfer':
      return new TransferIntent(logger, dlg, ep, synth, opts);
    default:
      logger.error(`unknown action ${opts.action}`);
  }
}
