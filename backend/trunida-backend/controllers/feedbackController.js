import UserFeedback from '../models/UserFeedback.js';

export async function getFeedbackStatus(req, res) {
  try {
    const exists = await UserFeedback.exists({ userId: req.user._id });
    res.json({ submitted: !!exists });
  } catch (err) {
    console.error('[feedback] status error:', err.message);
    res.status(500).json({ error: 'Failed to check feedback status.' });
  }
}

export async function submitFeedback(req, res) {
  try {
    const { rating } = req.body;
    if (!['high', 'some', 'low'].includes(rating)) {
      return res.status(400).json({ error: 'Invalid rating.' });
    }

    await UserFeedback.updateOne(
      { userId: req.user._id },
      { $set: { rating } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[feedback] submit error:', err.message);
    res.status(500).json({ error: 'Failed to save feedback.' });
  }
}
