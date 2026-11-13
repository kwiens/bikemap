import { isCityId } from '@/config/map.config';
import {
  isTrailIssueType,
  ISSUE_COMMENT_LIMIT,
  ISSUE_PHOTO_MAX_BYTES,
} from '@/data/trail-issues';
import {
  clientAddress,
  hashReporter,
  isCrossSiteRequest,
  isHoneypotTripped,
  parseIdentifier,
  reporterSalt,
} from '@/payload/conditions/guard';
import { submitTrailIssue } from '@/payload/issues/submit';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = ISSUE_PHOTO_MAX_BYTES + 32_000;
const UUID =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export async function POST(request: Request) {
  const city = new URL(request.url).searchParams.get('city');
  if (!isCityId(city)) return error('Choose a valid city.', 400);

  if (isCrossSiteRequest(request.headers, request.url)) {
    return error('Reports can only be filed from this site.', 403);
  }
  const contentType = request.headers.get('content-type');
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) {
    return error('Expected a report form.', 415);
  }

  // Enforce the request limit before parsing, including requests without a
  // Content-Length header. Replaying the bounded body preserves the boundary.
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return error('The photo is too large.', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return error('Expected a report form.', 400);
  let form: FormData;
  try {
    const body = Buffer.alloc(MAX_BODY_BYTES);
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        return error('The photo is too large.', 413);
      }
      body.set(value, size);
      size += value.byteLength;
    }
    form = await new Response(body.subarray(0, size), {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    return error('Could not read the report form.', 400);
  }

  if (isHoneypotTripped({ website: form.get('website') })) {
    return Response.json({ ok: true });
  }

  const category = form.get('category');
  const slug = parseIdentifier(form.get('slug'));
  const submissionId = form.get('submissionId');
  const comment = form.get('comment') ?? '';
  const photo = form.get('photo');
  if (!slug || !isTrailIssueType(category)) {
    return error('Choose a trail and an issue type.', 400);
  }
  if (typeof submissionId !== 'string' || !UUID.test(submissionId)) {
    return error('The report expired. Reopen the form and try again.', 400);
  }
  if (typeof comment !== 'string' || comment.length > ISSUE_COMMENT_LIMIT) {
    return error(
      `Keep the comment under ${ISSUE_COMMENT_LIMIT + 1} characters.`,
      400,
    );
  }
  if (
    form.getAll('photo').length > 1 ||
    (photo !== null && !(photo instanceof File))
  ) {
    return error('Attach one photo or send the report without it.', 400);
  }
  if (photo && photo.size > ISSUE_PHOTO_MAX_BYTES) {
    return error('The photo is too large.', 413);
  }

  const result = await submitTrailIssue({
    category,
    city,
    slug,
    submissionId,
    comment: comment.trim(),
    photo,
    reporterHash: hashReporter(clientAddress(request.headers), reporterSalt()),
  });
  return result.ok
    ? Response.json({ ok: true })
    : error(result.error, result.status);
}

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
