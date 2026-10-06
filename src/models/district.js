// §5.1 districts (seeded, read-only)
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    district_id: { type: Number, required: true },
    name: { type: String, required: true },
    province_id: { type: Number, required: true },
    updated_at: { type: Date, required: true },
  },
  { collection: 'districts', versionKey: false, strict: true },
);

// §5.2
schema.index({ district_id: 1 }, { unique: true });
schema.index({ province_id: 1 });

export default mongoose.model('District', schema);
