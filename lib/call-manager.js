const Emitter = require('events');
const config = require('config');
const optimizeCallerId = require('./optimize-caller-id');
const sha256 = require('sha256');
const transform = require('sdp-transform');
const TIMEOUT = 18;
const huntStart = new Map();

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
    this.instructions = this._createInstructions(opts.roster);

    //calls in progress: uri -> SipRequest
    this.cip = new Map();

    this.callerGone = false;
    this.uas.on('destroy', () => this.killCalls());
  }

  async exec() {
    for (const segment of this.instructions) {
      try {
        this.logger.info(segment, 'CallManager#exec');
        const fn = segment.strategy === 'hunt' ? this._hunt.bind(this) : this._simring.bind(this);
        const uac = await fn(segment.members);
        if (uac) return uac;
      } catch (err) {
        this.logger.error(err, 'CallManager#exec: Unhandled error');
      }
    }
    this.logger.info('CallManager#exec failed to connect to any members of the provided roster');
    return null;
  }

  async _hunt(members) {
    for (const m of members) {
      try {
        this.logger.info(`CallManager#hunt: attempting ${JSON.stringify(m)}`);
        const uac = await this.attemptOne(m);
        if (uac) return uac;

        if (this.callerGone) return null;
      }
      catch (err) {
        this.logger.error(err, `CallManager#hunt: Unhandled error attempting call to ${JSON.stringify(m)}`);
      }
    }
    this.logger.info('CallManager#hunt failed to connect to any members of the hunt group');
    return null;
  }

  async _simring(members) {
    const simrings = [];
    for (const m of members) {
      try {
        this.logger.info(`CallManager#simring: attempting ${JSON.stringify(m)}`);
        simrings.push(this.attemptOne(m));
      }
      catch (err) {
        this.logger.error(err, `Unhandled error attempting call to ${JSON.stringify(m)}`);
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
    this.logger.info('CallManager#simring failed to connect to any members of the simring group');
    return null;

  }

  attemptOne(target) {
    let timer = null;
    const uri = target.strategy === 'mobile' ? target.mobileUri : target.sipUri;
    const proxy = target.strategy === 'mobile' ? config.get('outbound.proxy') : null;
    const p = this.srf.createUAC(uri,
      {
        headers: {
          'From': optimizeCallerId(target.mobileTn)
        },
        localSdp: this.ep2.local.sdp,
        auth: config.get('auth'),
        proxy
      },
      {
        cbRequest: (err, reqSent) => {
          // add a request in progress
          this.cip.set(uri, reqSent);
          this.logger.debug(
            `CallManager#attemptOne: launched call to ${reqSent.uri}; ${this.cip.size} calls in progress`);
        },
        cbProvisional: (response) => {
          if (response.body && !this.bridged) {
            this.ep2.modify(removeDTLS(this.logger, response.body));
            this.ep.bridge(this.ep2);
            this.bridged = true ;
          }
        }
      })
      .then((dlg) => {
        this.cip.delete(uri);
        if (timer) clearTimeout(timer);

        dlg.remote.sdp = removeDTLS(this.logger, dlg.remote.sdp);

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

  _cycleHuntGroupMembers(members) {
    const arr = members.slice();
    const hash = sha256(JSON.stringify(arr));
    if (huntStart.has(hash)) {
      let idx = huntStart.get(hash);
      this.logger.debug(`_cycleHuntGroupMembers: idx is ${idx} for hash ${hash}`);
      if (++idx >= arr.length) idx = 0;
      huntStart.set(hash, idx);
      while (idx--) arr.push(arr.shift());
    }
    else {
      this.logger.debug(`_cycleHuntGroupMembers: initializing offset to zero for hash ${hash}`);
      huntStart.set(hash, 0);
    }
    return arr;
  }

  _createInstructions(roster) {
    //const host = config.get('analytics.server');
    //const username = config.get('auth.username');
    const instructions = [];
    const strategy = roster.strategy;
    const members = strategy === 'hunt' ? this._cycleHuntGroupMembers(roster.members) : roster.members;

    function initSegment(strategy) {
      return {
        strategy,
        members: []
      };
    }

    let segment = initSegment(strategy);
    members.forEach((t) => {
      const person = config.get(`people.${t}`);
      const sipUri = person.sip || `sip:${t}@sipvox1.voxbone.com`;
      const mobileUri = person.mobile ? `sip:${person.mobile}@${config.get('outbound.domain')}` : null;

      //if (config.get('analytics.enabled') && config.get('analytics.enabled') === true) {
      //  const dst = encodeURIComponent(sipUri);
      //  sipUri = `sip:${username}@${host};dst=${dst}`;
      //}

      if (person.strategy === 'all') {
        if (strategy === 'hunt') {
          if (segment.members.length) instructions.push(segment);
          segment = initSegment('simring');
          segment.members.push({sipUri, mobileUri, strategy: 'sip', mobileTn: person.mobile});
          segment.members.push({sipUri, mobileUri, strategy: 'mobile', mobileTn: person.mobile});
          instructions.push(segment);
          segment = initSegment(strategy);
        }
        else {
          segment.members.push({sipUri, mobileUri, strategy: 'sip', mobileTn: person.mobile});
          segment.members.push({sipUri, mobileUri, strategy: 'mobile', mobileTn: person.mobile});
        }
      }
      else {
        segment.members.push({sipUri, mobileUri, strategy: person.strategy, mobileTn: person.mobile});
      }
    });
    if (segment.members.length) instructions.push(segment);

    this.logger.debug(instructions, 'created instructions');
    return instructions;
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

function removeDTLS(logger, sdp) {
  const res = transform.parse(sdp);

  logger.debug(res, 'removeDTLS - before');

  ['invalid', 'setup', 'fingerprint'].forEach((attr) => delete res.media[0][attr]);

  logger.debug(res, 'removeDTLS - after');

  return transform.write(res);
}
