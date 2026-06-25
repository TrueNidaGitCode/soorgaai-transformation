import mongoose from 'mongoose';

const UserFeedbackSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      unique:   true,
      index:    true,
    },
    rating: {
      type:     String,
      required: true,
      enum:     ['high', 'some', 'low'],
    },
  },
  { timestamps: true }
);

const UserFeedback = mongoose.model('UserFeedback', UserFeedbackSchema);
export default UserFeedback;
