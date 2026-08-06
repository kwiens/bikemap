/* THIS FILE IS PART OF PAYLOAD'S ADMIN SCAFFOLDING — see docs/adr/0001.
 *
 * Payload's REST API, mounted at /api/<collection>. Server components should
 * prefer the Local API (getPayload) — it's a typed function call with no HTTP
 * hop; this exists for the admin UI and external clients.
 */
import config from '@payload-config';
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
} from '@payloadcms/next/routes';

export const GET = REST_GET(config);
export const POST = REST_POST(config);
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const OPTIONS = REST_OPTIONS(config);
