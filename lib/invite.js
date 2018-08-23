const selectVoice = require('./select-voice');
const promptDestination = require('./prompt-destination');
const resolveDestination = require('./resolve-destination');
const connectToDestination = require('./connect-destination');

module.exports = function(logger, synth) {

  return function(req, res) {
    const ms = req.app.locals.ms;

    ms.connectCaller(req, res)
      .then(doIvr.bind(null, logger, synth, req))
      .catch((err) => {
        logger.error(err, 'error connecting call to media server');
        res.send(500);
      });
  };
};

function doIvr(logger, synth, req, {endpoint, dialog}) {
  const dlg = dialog;
  const ep = endpoint;

  logger.info({callID: dlg.sip.callId}, 'successfully connected call to media server');

  // release endpoint when caller hangs up
  dlg.on('destroy', () => {
    logger.debug({callID: dlg.sip.callId}, 'got BYE from caller');
    ep.destroy();
  });

  const opts = {req, dlg, ep, logger, synth};

  selectVoice(opts)
    .then(promptDestination)
    .then(resolveDestination)
    .then(connectToDestination)
    .then((result) => {
      logger.info(`final uri: ${result.uri}`);
      return;
    })
    .catch((err) => {
      if (err.message !== 'hangup') {
        logger.error(err, 'Error handling call');
        ep.destroy();
        dlg.destroy();
      }
    });

}

