const parseUri = require('drachtio-srf').parseUri;

module.exports = function(req) {
  const from = req.getParsedHeader('From');
  if (from.uri) {
    const uri = parseUri(from.uri);
    if (uri.user) {
      const tn = uri.user.startsWith('+') ? uri.user.slice(1) : uri.user;
      if (tn.startsWith('1')) return 'tone_stream://%(2000,4000,440,480);loops=-1';
      else if (tn.startsWith('44')) return 'tone_stream://%(400,200,400,450);%(400,2000,400,450);loops=-1';
      else if (tn.startsWith('32')) return 'tone_stream://%(1000,3000,425);loops=-1';

    }
  }
  return 'tone_stream://%(2000,4000,440,480);loops=-1';
};
