const Intent = require('./intent');

class BlindTransferIntent extends Intent {
  constructor(logger, dlg, ep, synth, opts) {
    super(logger, dlg, ep, synth, opts);

    this.voice = this.opts.prompt ? this.opts.prompt.voice : null;
  }

  doSynth() {
    const prompt = this.opts.data.prompt;

    return Promise.resolve()
      .then(() => {
        if (!prompt) return ;
        if (typeof prompt === 'string') return this.synth(prompt);
        return this.synth(prompt.text, this.voice);
      });
  }

  determineIntent(response) {
    this.logger.info(response, 'playCollect returned');

  }

  exec() {
    this.doSynth()
      .then((file) => {
        if (file) return this.ep.play(file);
        return;
      })
      .then(() => this.dlg.request({
        method: 'REFER',
        headers: {
          'Refer-To': this.opts.data.uri
        }
      }))
      .then((res) => {
        this.logger.info(`response to REFER was ${res.status}`);

        if (res.status > 299) return;

        return new Promise((resolve, reject) => {
          this.dlg.on('notify', (req, res) => {
            res.send(200);
            const state = req.get('Subscription-State');
            this.logger.info(`got notify with Subscription-State: ${state}`);
            if (/terminated/.test(state)) resolve();
          });
        });
      })
      .then(() => {
        this.logger.info(`transfer complete for ${this.dlg.dialogType} dialog`);
        this.ep.destroy();
        return this.dlg.destroy();
      })
      .catch((err) => {
        this.logger.error(err, 'transfer error');
      });
    return this;
  }
}

module.exports = BlindTransferIntent;
