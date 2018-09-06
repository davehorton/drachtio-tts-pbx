const selectVoice = require('./select-voice');
const promptDestination = require('./prompt-destination');
const resolveDestination = require('./resolve-destination');
const connectDestination = require('./connect-destination');
const recordVoicemail = require('./record-voicemail');
const moment = require('moment');

module.exports = function(log, synth) {

  return async function(req, res) {
    const logger = log.child({callID: req.get('Call-ID')});
    const ms = req.app.locals.ms;
    let uac;

    try {
      req.startTime = moment();
      const {ep, dlg} = await connectMS(ms, req, res);
      const voice = selectVoice(req);
      const digits = await promptDestination(logger, synth, ep, voice);
      const dest = resolveDestination(logger, digits, req);
      if (dest && dest.length) {
        uac = await connectDestination(logger, synth, req, res, dlg, ep, digits, voice, dest);
        if (uac) logger.info(`successfully connected to ${uac.remote.uri}`);
      }
      if (!uac) {
        const results = await recordVoicemail(logger, synth, req, res, dlg, ep, voice);
        logger.info('hanging up call after voicemail');
      }
    } catch (err) {
      if (err.message != 'hangup') logger.error(err, 'Unhandled error');
    }
  };
};

function connectMS(ms, req, res) {
  return ms.connectCaller(req, res, {codecs: 'PCMU'})
    .then(({endpoint, dialog}) => {
      dialog.on('destroy', () => endpoint.destroy());
      return {dlg: dialog, ep: endpoint};
    });
}
