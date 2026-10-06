// §5.4 Ids for new records
import Counter from '../models/counter.js';
import Installation from '../models/installation.js';
import Reading from '../models/reading.js';

export async function nextSeq(name) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return counter.seq;
}

export async function nextInstallationId() {
  const seq = await nextSeq('installation_id');
  return `INS-${String(seq).padStart(6, '0')}`;
}

export async function nextReadingId() {
  return nextSeq('reading_id');
}

async function highestInstallationNumber() {
  const latest = await Installation.findOne({}, { installation_id: 1 })
    .sort({ installation_id: -1 })
    .lean();
  return latest ? Number(latest.installation_id.slice('INS-'.length)) : 0;
}

async function highestReadingId() {
  const latest = await Reading.findOne({}, { reading_id: 1 }).sort({ reading_id: -1 }).lean();
  return latest ? latest.reading_id : 0;
}

async function raiseCounter(name, highest) {
  await Counter.updateOne({ _id: name }, { $max: { seq: highest } }, { upsert: true });
}

// §5.5 step 4: returns the counter values after raising
export async function raiseCounters() {
  await raiseCounter('installation_id', await highestInstallationNumber());
  await raiseCounter('reading_id', await highestReadingId());

  const counters = await Counter.find({ _id: { $in: ['installation_id', 'reading_id'] } }).lean();
  return Object.fromEntries(counters.map((counter) => [counter._id, counter.seq]));
}
