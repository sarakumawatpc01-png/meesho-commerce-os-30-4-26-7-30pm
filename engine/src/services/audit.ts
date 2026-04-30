import { query } from '../db/client';

interface AuditEntry {
  actorId?: string;
  actorType: 'admin' | 'ai_assistant' | 'system';
  actorName?: string;
  siteId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
}

export function auditLog(entry: AuditEntry): void {
  // Fire and forget — don't block the request
  query(
    `INSERT INTO engine.audit_log (actor_id, actor_type, actor_name, site_id, action, resource, resource_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.actorId || null,
      entry.actorType,
      entry.actorName || null,
      entry.siteId || null,
      entry.action,
      entry.resource || null,
      entry.resourceId || null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ipAddress || null,
    ]
  ).catch(() => {}); // Never fail the main request
}
