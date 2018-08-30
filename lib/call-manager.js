const parseUri = require('drachtio-srf').parseUri;
const Emitter = require('events');
const config = require('config');
const TIMEOUT = 25;

class CallManager extends Emitter {
  constructor(opts) {
    super();

    this.logger = opts.logger;
    this.srf = opts.srf;
    this.req = opts.req;
    this.res = opts.res;
    this.uas = opts.dlg;
    this.ep = opts.ep;
    this.ep2 = opts.ep2;
    this.bridged = false ;

    const host = config.get('analytics.server');
    const username = config.get('auth.username');
    this.targets = opts.targets.map((t) => {
      //const person = config.get(`people.${t}`);
      // TODO: check strategy to see if we should ring mobile
      if (config.get('analytics.enabled') && config.get('analytics.enabled') === true) {
        const dst = encodeURIComponent(`sip:${t}@sipvox1.voxbone.com`);
        return `sip:${username}@${host};dst=${dst}`;
      }
      return `sip:${t}@sipvox1.voxbone.com`;
    });

    const ruri = parseUri(this.req.uri);
    this.fromHeader = `<sip:${ruri.user}@voxbone.com>`;

    //calls in progress: uri -> SipRequest
    this.cip = new Map();

    this.callerGone = false;
    this.uas.on('destroy', () => this.killCalls());
  }

  async hunt() {
    for (const uri of this.targets) {
      try {
        this.logger.info(`CallManager#hunt: attempting ${uri}`);
        const uac = await this.attemptOne(uri);
        if (uac) return uac;

        if (this.callerGone) return null;
      }
      catch (err) {
        this.logger(err, `CallManager#hunt: Unhandled error attempting call to ${uri}`);
      }
    }
    this.logger.info(`CallManager#hunt from ${this.fromHeader} failed to connect to any members`);
    return null;
  }

  async simring() {
    const simrings = [];
    for (const uri of this.targets) {
      try {
        this.logger.info(`CallManager#simring: attempting ${uri}`);
        simrings.push(this.attemptOne(uri));
      }
      catch (err) {
        this.logger(err, `Unhandled error attempting call to ${uri}`);
      }
    }

    // take the first one that answers
    try {
      const dlg = await oneSuccess(simrings);

      //knock the rest down
      this.killCalls(dlg._originalUri);
      return dlg;
    }
    catch (err) {
    }
    this.logger.info(`CallManager#simring from ${this.fromHeader} failed to connect to any members`);
    return null;

  }

  attemptOne(uri) {
    let timer = null;
    const p = this.srf.createUAC(uri, {headers: {'From': this.fromHeader}, localSdp: this.ep2.local.sdp},
      {
        cbRequest: (err, reqSent) => {
          // add a request in progress
          this.cip.set(uri, reqSent);
          this.logger.debug(
            `CallManager#attemptOne: launched call to ${reqSent.uri}; ${this.cip.size} calls in progress`);
        },
        cbProvisional: (response) => {
          if (response.body && !this.bridged) {
            this.ep2.modify(response.body);
            this.ep.bridge(this.ep2);
            this.bridged = true ;
          }
        }
      })
      .then((dlg) => {
        this.cip.delete(uri);
        if (timer) clearTimeout(timer);

        if (this.ep2.remote.sdp !== dlg.remote.sdp) {
          this.ep2.modify(dlg.remote.sdp);
          if (!this.bridged) {
            this.ep.bridge(this.ep2);
            this.bridged = true;
          }
        }
        dlg._originalUri = uri;
        return dlg;
      })
      .catch((err) => {
        if (!this.callerGone) {
          this.logger.info(`CallManager#attemptOne: call to ${uri} failed with ${err.status}`);
        }
        return null;
      });

    timer = setTimeout(() => {
      if (this.cip.has(uri)) {
        this.logger.info(`CallManager#attemptOne: timeout on call to ${uri}; tearing down call`);
        const req = this.cip.get(uri);
        this.cip.delete(uri);
        req.cancel();
      }
    }, TIMEOUT * 1000);

    return p;
  }

  killCalls(spareMe) {
    this.callerGone = true;
    for (const arr of this.cip) {
      const uri = arr[0];
      const req = arr[1];

      if (spareMe === uri) {
        this.logger.info(`not killing call to ${uri} because we were asked to spare it`);
      }
      else {
        this.logger.info(`killing call to ${uri}`);
        req.cancel();
      }
    }
    this.cip.clear();
  }
}

module.exports = CallManager;

function oneSuccess(promises) {
  return Promise.all(promises.map((p) => {
    // If a request fails, count that as a resolution so it will keep
    // waiting for other possible successes. If a request succeeds,
    // treat it as a rejection so Promise.all immediately bails out.
    return p.then((val) => Promise.reject(val), (err) => Promise.resolve(err));
  }))
    .then(
    // If '.all' resolved, we've just got an array of errors.
      (errors) => Promise.reject(errors),
      // If '.all' rejected, we've got the result we wanted.
      (val) => Promise.resolve(val)
    );
}
