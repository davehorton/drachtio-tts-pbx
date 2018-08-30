const config = require('config');

module.exports = async function(logger, synth, req, res, dlg, ep, voice) {
  let file = `${config.get('prompts.voicemail.folder')}/${req.get('Call-ID')}.wav`;
  let results;
  try {
    const greeting = await synth(config.get('prompts.voicemail.greeting'), voice);
    await ep.play(greeting);
    await ep.execute('gentones', '%(500,0,800)');
    await ep.set('playback_terminators', '#');
    results = await ep.record(file, {timeLimitSecs: 30});
    logger.info(results, `recording finished to ${file}`);
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
