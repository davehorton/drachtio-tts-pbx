const config = require('config');
const fs = require('fs');
const moment = require('moment');
const request = require('request');
const parseUri = require('drachtio-srf').parseUri;
const utils = require('./utils');
require('request-debug')(request);

module.exports = function(logger, file, req, lang, customMetadata) {
  customMetadata = customMetadata || {};
  const info = utils.getInfo(req);

  const formData = {
    startTime: info.start,
    endTime: info.end,
    callId: info.callId,
    calledNumber: info.calledNumber,
    lang
  };

  Object.assign(formData, /^[0-9+]$/.test(info.fromUser) ? {callingNumber: info.fromUser} : {callerId: info.fromUser});

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

  const message = `Incoming voicemail: Call started at ${formData.startTime} and ended at ${formData.endTime} with Call Id: ${formData.callId}. Called Number: ${formData.calledNumber}`;
  utils.postToSlack(message);

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
