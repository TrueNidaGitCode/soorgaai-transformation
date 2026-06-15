import mongoose from 'mongoose';

const CompanyContextSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      unique:   true,
      index:    true,
    },
    content: { type: String, required: true },
    orgName: { type: String },
    role:    { type: String },
  },
  { timestamps: true }
);

const CompanyContext = mongoose.model('CompanyContext', CompanyContextSchema);
export default CompanyContext;
