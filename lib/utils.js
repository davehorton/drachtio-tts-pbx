const config = require('config');
const request = require('request');
const moment = require('moment');
const parseUri = require('drachtio-srf').parseUri;

function postToSlack(msg, logger) {
  if (config.has('slackHookUrl')) {
    const slackPost = {
      method: 'POST',
      url: config.get('slackHookUrl'),
      json: true,
      body: {'text': msg}
    };
    request(slackPost);
  }
}

function getInfo(req) {
  const start = req.startTime.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
  const end = moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
  const callId = req.get('Call-ID');

  const from = req.getParsedHeader('From');
  const fromUri = parseUri(from.uri);
  const fromUser = fromUri.user;

  const uri = parseUri(req.uri);
  const calledNumber = uri.user || 'anonymous';

  return {start, end, callId, fromUser, calledNumber};
}

module.exports.postToSlack = postToSlack;
module.exports.getInfo = getInfo;
