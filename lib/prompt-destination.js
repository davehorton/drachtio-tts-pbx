const config = require('config');
const mainPrompt = config.get('prompts.main');
const invalidPrompt = config.get('prompts.invalid');

module.exports = promptDestination;

function promptDestination(opts) {
  const {logger, synth, ep, voice} = opts;
  let goodbye;

  return Promise.all([synth(mainPrompt, voice),
    synth(invalidPrompt, voice), synth('Goodbye.', voice)])
    .then((files) => {
      logger.info(`synthesized files to ${files}`);
      goodbye = files[2];
      return ep.playCollect({
        file: files[0],
        invalidFile: files[1],
        min: 1,
        max: 4,
        tries: 3,
        regexp: '[1|2|3|\\d{4}]',
        timeout: 6000,
        digitTimeout: 1500
      });
    })
    .then((response) => {
      if (response.digits) return Object.assign(opts, {digits: response.digits});
      return ep.play(goodbye);
    })
    .then((opts) => {
      if (!opts.digits) throw new Error('invalid entry');
      return opts;
    });
}
