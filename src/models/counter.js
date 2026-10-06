// §5.1 counters (internal), §5.4
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, required: true },
  },
  { collection: 'counters', versionKey: false, strict: true },
);

export default mongoose.model('Counter', schema);
