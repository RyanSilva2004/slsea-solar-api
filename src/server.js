import config from './config.js';
import app from './app.js';

// §5.5 step 7
app.listen(config.port, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Listening on port ${config.port} (${config.publicBaseUrl})`);
});
