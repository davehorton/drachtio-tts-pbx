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
    callingNumber: fromUri.user || 'anonymous',
    calledNumber: uri.user,
    lang,
    callerId: fromUri.name || fromUri.user
  };

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
