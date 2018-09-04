const config = require('config');
const predialPrompt = config.get('prompts.predial');
const CallManager = require('./call-manager');

module.exports = async function(logger, synth, req, res, dlg, ep, digits, voice, dest) {
  const ms = ep.mediaserver;
  const srf = dlg.srf;
  logger.info(`outdial targets: ${JSON.stringify(dest)}`);
  try {
    if (digits !== 3) {
      const path = await synth(predialPrompt, voice);
      await ep.play(path);
    }
    const ep2 = await ms.createEndpoint({codecs: 'PCMU'});
    let uac;
    for (const level of dest) {
      logger.info(level, 'Executing calls on level');
      const callManager = new CallManager({logger, srf, req, res, dlg, ep, ep2, roster: level});
      uac = await callManager.exec();
      if (uac) break;
    }
    if (uac) setHandlers(logger, dlg, uac, ep, ep2);
    else logger.debug('global failure to connect to anyone, send to voicemail');
    return uac;
  } catch (err) {
    logger.error(err, 'Error connecting call');
    throw err;
  }
};

function setHandlers(logger, uas, uac, ep, ep2) {
  uac.on('destroy', () => {
    logger.info('call ended by hangup from called party end');
    uas.destroy();
    ep.destroy();
    ep2.destroy();
  });
  uas.on('destroy', () => {
    logger.info('call ended by hangup from calling party end');
    uac.destroy();
    ep2.destroy();
  });
  ep2.on('destroy', () => {
    logger.debug('ep2 was hungup');
  });
  ep.on('destroy', () => {
    logger.debug('ep was hungup');
  });
}
