// §5.1 readings (append-only)
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    reading_id: { type: Number, required: true },
    installation_id: { type: String, required: true },
    recorded_at: { type: Date, required: true },
    received_at: { type: Date, required: true },
    power_kw: { type: Number, required: true },
    energy_kwh: { type: Number, required: true },
    voltage: { type: Number, required: true },
  },
  { collection: 'readings', versionKey: false, strict: true },
);

// §5.2
schema.index({ reading_id: 1 }, { unique: true });
schema.index({ installation_id: 1, recorded_at: 1 }, { unique: true });
schema.index({ installation_id: 1, received_at: 1 });

export default mongoose.model('Reading', schema);
