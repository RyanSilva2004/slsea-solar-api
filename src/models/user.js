// §5.1 users (not seeded)
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    name: { type: String, required: true },
    username: { type: String, required: true },
    password_hash: { type: String, required: true },
    password_changed_at: { type: Date, required: true },
    role: { type: String, required: true, enum: ['ANALYST', 'INSTALLATION_OFFICER', 'ADMIN'] },
    jurisdiction_level: { type: String, required: true, enum: ['NATIONAL', 'PROVINCIAL', 'DISTRICT'] },
    district_id: { type: Number, required: true },
    created_at: { type: Date, required: true },
    updated_at: { type: Date, required: true },
  },
  { collection: 'users', versionKey: false, strict: true },
);

// §5.2
schema.index({ user_id: 1 }, { unique: true });
schema.index({ username: 1 }, { unique: true });

export default mongoose.model('User', schema);
