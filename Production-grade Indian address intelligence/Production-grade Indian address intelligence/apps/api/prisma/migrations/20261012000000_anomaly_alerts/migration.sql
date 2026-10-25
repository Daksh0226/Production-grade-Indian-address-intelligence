-- Spec 11.3 — persist auto-detected anomalies (traffic spikes / error rates) as usage alerts
ALTER TYPE "UsageAlertKind" ADD VALUE IF NOT EXISTS 'USAGE_SPIKE';
ALTER TYPE "UsageAlertKind" ADD VALUE IF NOT EXISTS 'HIGH_ERROR_RATE';
