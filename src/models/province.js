// §5.1 provinces (seeded, read-only)
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    province_id: { type: Number, required: true },
    name: { type: String, required: true },
    updated_at: { type: Date, required: true },
  },
  { collection: 'provinces', versionKey: false, strict: true },
);

// §5.2
schema.index({ province_id: 1 }, { unique: true });

export default mongoose.model('Province', schema);
