// §5.5 Start-up sequence
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import config from './config.js';
import app from './app.js';
import Province from './models/province.js';
import District from './models/district.js';
import Substation from './models/substation.js';
import Installation from './models/installation.js';
import Reading from './models/reading.js';
import User from './models/user.js';
import Counter from './models/counter.js';
import { raiseCounters } from './lib/ids.js';
import { loadGeography } from './lib/geography.js';
import { hashPassword } from './lib/secrets.js';

const models = [Province, District, Substation, Installation, Reading, User, Counter];

async function connect() {
  await mongoose.connect(config.mongodbUri, { autoIndex: false });
  console.log(`MongoDB connected (database "${mongoose.connection.name}")`);
}

// §5.2: createIndexes only, never syncIndexes
async function createIndexes() {
  for (const model of models) {
    await model.createIndexes();
  }
  console.log(`Indexes ensured for ${models.length} collections`);
}

// §7.9
async function bootstrapAdmin() {
  if ((await User.countDocuments()) > 0) {
    console.log('Bootstrap admin: users exist, nothing created');
    return;
  }
  const password = config.bootstrapAdminPassword;
  if (!password) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required while the users collection is empty.');
  }
  const now = new Date();
  await User.create({
    user_id: crypto.randomUUID(),
    name: 'HQ Administrator',
    username: config.bootstrapAdminUsername,
    password_hash: await hashPassword(password),
    password_changed_at: now,
    role: 'ADMIN',
    jurisdiction_level: 'NATIONAL',
    district_id: 1,
    created_at: now,
    updated_at: now,
  });
  console.log(`Bootstrap admin: created "${config.bootstrapAdminUsername}"`);
}

async function start() {
  await connect();
  await createIndexes();

  const counters = await raiseCounters();
  console.log(`Counters: installation_id=${counters.installation_id}, reading_id=${counters.reading_id}`);

  const geography = await loadGeography();
  console.log(
    `Geography cache: ${geography.provinces} provinces, ${geography.districts} districts, ${geography.substations} substations`,
  );

  await bootstrapAdmin();
}

try {
  await start();
} catch (err) {
  console.error('Start-up failed:', err);
  process.exit(1);
}

// §5.5 step 7
app.listen(config.port, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Listening on port ${config.port} (${config.publicBaseUrl})`);
});
