const Intent = require('./intent');

class DtmfIntent extends Intent {
  constructor(logger, dlg, ep, synth, opts) {
    super(logger, dlg, ep, synth, opts);

    this.voice = this.opts.prompt ? this.opts.prompt.voice : null;
    this.passes = 0;
  }

  doSynth() {
    const prompt = this.opts.prompt;

    return Promise.resolve()
      .then(() => {
        if (!prompt) return 'silence_stream://250';
        if (typeof prompt === 'string') return this.synth(prompt);
        return this.synth(prompt.text, this.voice);
      })
      .then((mainPrompt) => {
        this.opts.file = mainPrompt;
        if (this.opts.digits && this.opts.digits.invalid) {
          if (typeof this.opts.digits.invalid === 'string') return this.synth(this.opts.digits.invalid);
          return this.synth(this.opts.digits.invalid.prompt, this.opts.digits.invalid.voice || this.voice);
        }
        return ;
      })
      .then((invalidPrompt) => {
        if (invalidPrompt) this.opts.invalidFile = invalidPrompt;
        return;
      });
  }

  determineIntent(response) {
    this.logger.info(response, 'playCollect returned');

    if (response.digits)
      if (this.opts.actions[response.digits]) {
        const action = this.opts.actions[response.digits];
        return this.emit('action', action);
      }
  }

  preparePlayCollectOpts() {
    const opts = {};
    ['file', 'invalidFile'].forEach((prop) => {
      if (this.opts[prop]) opts[prop] = this.opts[prop];
    });

    if (this.opts.digits) {
      ['regexp', 'digits', 'tries', 'min', 'max', 'timeout', 'digitTimeout'].forEach((prop) => {
        if (this.opts.digits[prop]) opts[prop] = this.opts.digits[prop];
      });
    }
    this.logger.debug(opts, 'playCollect opts');
    return opts;
  }

  exec() {
    this.doSynth()
      .then(() => {
        this.logger.debug(`options ${JSON.stringify(this.opts)}`);
        return this.ep.playCollect(this.preparePlayCollectOpts(this.opts));
      })
      .then((results) => {
        return this.determineIntent(results);
      })
      .catch((err) => {
        if (err.message.startsWith('hangup')) {
          this.logger.debug('playCollect terminated due to caller hangup');
          this.emit('hangup');
        }
        else {
          this.logger.error(err, 'playCollect error');
        }

      });
    return this;
  }
}

module.exports = DtmfIntent;
