const config = require('config');
const postVoicemail = require('./post-voicemail');

module.exports = async function(logger, synth, req, res, dlg, ep, voice) {
  let file = `${config.get('prompts.voicemail.folder')}/${req.get('Call-ID')}.wav`;
  let results;
  try {
    const greeting = await synth(config.get('prompts.voicemail.greeting'), voice);
    await ep.play(greeting);
    await ep.execute('gentones', '%(500,0,800)');
    ep.set({
      'playback_terminators': '#',
      'record_rate': '16000'
    });

    results = await ep.record(file, {timeLimitSecs: 60});
    logger.info(results, `recording finished to ${file}`);

    postVoicemail(logger, file, req, 'en-US');
  }
  catch (err) {
    logger.error(err, 'Error recording voicemail');
    file = null;
  }

  dlg.destroy().catch((err) => {
    //logger.info(err, 'error destroying dialog');
  });
  ep.destroy().catch((err) => {
    //logger.info(err, 'error destroying ep');
  });

  return file;
};
