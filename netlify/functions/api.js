const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const app = require('../../server/app');

const handler = serverless(app, {
  // File unduhan dikirim sebagai base64; JSON dan teks tetap dikirim apa adanya.
  binary: (headers) => !/json|text/i.test(String(headers['content-type'] || '')),
});

exports.handler = async (event, context) => {
  connectLambda(event);
  // Permintaan /api/* diarahkan ke fungsi ini; pastikan Express tetap melihat path /api/...
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '/api');
  }
  return handler(event, context);
};
