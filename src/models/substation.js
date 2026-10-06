// §5.1 substations (seeded, read-only)
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    substation_id: { type: Number, required: true },
    name: { type: String, required: true },
    district_id: { type: Number, required: true },
    updated_at: { type: Date, required: true },
  },
  { collection: 'substations', versionKey: false, strict: true },
);

// §5.2
schema.index({ substation_id: 1 }, { unique: true });
schema.index({ district_id: 1 });

export default mongoose.model('Substation', schema);
