const tts = require('@google-cloud/text-to-speech');
const fs = require('fs-extra');
const sha256 = require('sha256');
const path = require('path');
const config = require('config');

/**
 * export a function which when given text and a voice configuration object
 * will return the path to a wave file containing an audio recording of that
 * text using TTS.  TTS results are cached, such that if the same text and
 * voice combination is later requested, the path of the cached wave file
 * will be returned (i.e., not hitting the TTS service again).
 *
 * @param  {[Object]} logger pino logger
 * @param  {[string]} promptsDir path to the folder where prompts shall be stored
 * @param  {[path]} keyFileName  path to json file containing service account credentials
 * @return {[function]} Function with signature (text, voice)
 */
module.exports = function(logger, promptsDir, keyFilename) {
  const client = new tts.TextToSpeechClient({keyFilename});
  logger.debug(`keyFilename: ${keyFilename}`);
  fs.ensureDirSync(promptsDir);

  return function(text, voice) {
    voice = voice || config.get('ivr.default.voice');
    const input = `${text}${JSON.stringify(voice)}`;
    const hash = sha256(input);
    const filePath = path.resolve(promptsDir, `${hash}.wav`);
    return fs.pathExists(filePath)
      .then((exists) => {
        if (exists) {
          logger.debug(`using cached prompt for ${text} with voice: ${JSON.stringify(voice)}`);
          return filePath;
        }

        logger.debug(`synthesizing ${text} with voice: ${JSON.stringify(voice)}`);
        return client.synthesizeSpeech({
          input: {text: text},
          voice: voice,
          audioConfig: {audioEncoding: 'LINEAR16'},
        });
      })
      .then((responses) => {
        if (typeof responses === 'string') return responses;

        logger.debug(`successfully synthesized text to ${filePath}`);
        return fs.writeFile(filePath, responses[0].audioContent, 'binary');
      })
      .then(() => filePath);
  };
};
