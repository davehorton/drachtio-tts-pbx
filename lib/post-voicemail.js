const config = require('config');
const fs = require('fs');
const moment = require('moment');
const request = require('request');
const parseUri = require('drachtio-srf').parseUri;
require('request-debug')(request);

module.exports = function(logger, file, req, lang, customMetadata) {
  customMetadata = customMetadata || {};

  const callId = req.get('Call-ID');
  const from = req.getParsedHeader('From');
  const fromUri = parseUri(from.uri);
  const uri = parseUri(req.uri);
  const startTime = req.startTime;
  const endTime = moment();

  const formData = {
    startTime: startTime.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    endTime: endTime.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    callId,
    calledNumber: uri.user || 'anonymous',
    lang
  };

  Object.assign(formData, /^[0-9+]$/.test(fromUri.user) ? {callingNumber: fromUri.user} : {callerId: fromUri.user});

  if (req.has('X-Voxbone-Context')) {
    const context = req.get('X-Voxbone-Context');
    try {
      const obj = JSON.parse(context);
      Object.assign(formData, obj);
    } catch (err) {
      Object.assign(formData, {customMetadata: context});
    }
  }

  logger.debug(`posting voicemail from ${file} with data: ${JSON.stringify(formData)}`);

  Object.assign(formData, {
    caller: {
      value: fs.createReadStream(file),
      options: {
        filename: 'voicemail.wav',
        contentType: 'audio/wav'
      }
    }
  });

  const message = `Call started at ${formData.startTime} and ended at ${formData.endTime} with Call Id: ${formData.callId}. Called Number: ${formData.calledNumber}`;

  if (config.has('slackHookUrl')) {
    const slackPost = {
      method: 'POST',
      url: config.get('slackHookUrl'),
      json: true,
      body: {'text': message}
    };

    request(slackPost);
  }

  request.post({
    url: config.get('voicemail.apiUrl'),
    headers: config.get('voicemail.headers'),
    formData: formData
  }, (err, httpResponse, body) => {
    if (err) {
      logger.error(err, 'failed to post voicemail');
    }
  });

};
