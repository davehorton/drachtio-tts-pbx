const Emitter = require('events');

class Intent extends Emitter {
  constructor(logger, dlg, ep, synth, opts) {
    super();

    this.logger = logger;
    this.dlg = dlg;
    this.ep = ep;
    this.synth = synth;
    this.opts = opts;
  }

  exec() {
    throw new Error('SubclassResponsibility');
  }
}

module.exports = Intent;
