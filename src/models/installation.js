// §5.1 installations
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    installation_id: { type: String, required: true },
    meter_id: { type: String, required: true },
    capacity_kw: { type: Number, required: true },
    status: { type: String, required: true, enum: ['ACTIVE', 'DECOMMISSIONED'] },
    substation_id: { type: Number, required: true },
    device_secret_hash: { type: String, default: null },
    device_secret_issued_at: { type: Date, default: null },
    created_at: { type: Date, required: true },
    updated_at: { type: Date, required: true },
  },
  { collection: 'installations', versionKey: false, strict: true },
);

// §5.2
schema.index({ installation_id: 1 }, { unique: true });
schema.index({ meter_id: 1 }, { unique: true });
schema.index({ status: 1 });
schema.index({ substation_id: 1 });

export default mongoose.model('Installation', schema);
