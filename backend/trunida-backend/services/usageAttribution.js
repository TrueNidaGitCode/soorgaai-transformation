/**
 * Svarg — wiring the usage ledger to the model calls
 *
 * This is the Svarg-only half of accounting. It exists as its own file because
 * the two places it would naturally have lived — services/llmService.js and
 * middleware/authMiddleware.js — are both copied verbatim into every
 * application Eame generates (see CORE_FILES in eameProjectBuilder.js).
 *
 * Putting the ledger imports in them broke every Eame build: the tenant
 * project has no usageContext.js, the local-imports gate caught it correctly,
 * and three attempts burned before the run gave up. A file that ships to
 * customers may not import anything only Svarg has.
 *
 * So llmService exposes observeLlmCalls() and knows nothing about ledgers, and
 * this registers against it at boot.
 */

import jwt from 'jsonwebtoken';
import { observeLlmCalls } from './llmService.js';
import { currentUsage, currentRun, attributeTo } from './usageContext.js';
import { recordLedgerCall, costOf } from './usageLedgerService.js';

/**
 * Attribute a request to its account, for the ledger.
 *
 * Verifies the token here rather than reading req.user, because req.user is
 * set by `protect` — which runs per route, after this — and because
 * authMiddleware.js ships to customers and must not know Svarg's billing
 * exists. A bad or absent token simply means no attribution; this must never
 * be the thing that rejects a request, since `protect` is what decides that.
 */
export function attributeRequest(req, res, next) {
  const header = req.header('Authorization');
  const token = header?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
      attributeTo(decoded.userId);
    } catch {
      // Anonymous or expired. The guest routes mark themselves separately.
    }
  }
  next();
}

/** Called once at boot. Everything after this lands in the ledger. */
export function startUsageAccounting() {
  observeLlmCalls(({ label, model, inputTokens, outputTokens }) => {
    const { userId, stage, guest } = currentUsage();
    const costUsd = costOf(model, inputTokens, outputTokens);

    // "What did THAT run cost" — accumulated for the piece of work in flight
    // and logged when it finishes. The ledger answers the monthly question;
    // this answers the one asked after a provider bill moves.
    const run = currentRun();
    if (run) {
      run.calls++;
      run.inputTokens += inputTokens;
      run.outputTokens += outputTokens;
      run.costUsd += costUsd;
    }

    // Durable, per-account, deliberately not awaited: a ledger write that
    // fails must never fail the generation it is describing.
    if (userId || guest) {
      recordLedgerCall({
        userId, guest, stage, label, costUsd,
        inputTokens, outputTokens,
      }).catch(() => {});
    }
  });
}
