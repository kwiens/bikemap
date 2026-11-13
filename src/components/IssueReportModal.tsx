'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera, faTimes } from '@fortawesome/free-solid-svg-icons';
import { activeCityId } from '@/config/map.config';
import {
  ISSUE_COMMENT_LIMIT,
  ISSUE_PHOTO_MAX_BYTES,
  ISSUE_PHOTO_MAX_EDGE,
  TRAIL_ISSUE_TYPES,
} from '@/data/trail-issues';
import { dispatchMapEvent, MAP_EVENTS, type MapEventDetails } from '@/events';
import { useMapEvent } from '@/hooks/useMapEvent';
import { ReportSelect } from './ReportSelect';

export function IssueReportModal() {
  const [target, setTarget] = useState<
    MapEventDetails['issue-report-open'] | null
  >(null);
  const opener = useRef<HTMLElement | null>(null);
  useMapEvent(MAP_EVENTS.ISSUE_REPORT_OPEN, (detail) => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setTarget(detail);
  });

  if (!target) return null;

  return (
    <IssueForm
      target={target}
      close={() => {
        setTarget(null);
        opener.current?.focus();
      }}
    />
  );
}

function IssueForm({
  target,
  close,
}: {
  target: MapEventDetails['issue-report-open'];
  close: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const submissionId = useRef<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    categoryRef.current?.focus();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function choosePhoto(file: File) {
    setIsPreparingPhoto(true);
    setError('');
    try {
      setPhoto(await preparePhoto(file));
    } catch {
      setError('Could not open that photo. Try another image.');
    } finally {
      setIsPreparingPhoto(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isPreparingPhoto) return;
    const form = new FormData(event.currentTarget);
    submissionId.current ??= crypto.randomUUID();
    form.set('slug', target.slug);
    form.set('submissionId', submissionId.current);
    if (photo) form.set('photo', photo);

    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/map/trail-issues?city=${activeCityId}`,
        {
          method: 'POST',
          body: form,
        },
      );
      const result: { ok?: boolean; error?: string } | null = await response
        .json()
        .catch(() => null);
      if (!response.ok || !result?.ok) {
        setError(
          result?.error ?? 'Could not save the report. Please try again.',
        );
        return;
      }
      dispatchMapEvent(MAP_EVENTS.TOAST, {
        message: 'Trail issue reported. Thanks!',
      });
      close();
    } catch {
      setError(
        'Could not send the report. Check your connection and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <dialog
      aria-labelledby="issue-report-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-auto rounded-3xl bg-white p-5 text-app-ink shadow-xl backdrop:bg-black/60"
      onCancel={(event) => {
        event.preventDefault();
        if (!isSubmitting) close();
      }}
      ref={dialogRef}
    >
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="issue-report-title" className="text-lg font-bold">
            Report trail issue
          </h2>
          <p className="truncate text-sm text-gray-600">{target.trailName}</p>
        </div>
        <button
          aria-label="Close"
          className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg text-xl hover:bg-gray-100"
          disabled={isSubmitting}
          onClick={close}
          type="button"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </header>

      <form onSubmit={submit} className="space-y-4">
        <input
          aria-hidden="true"
          autoComplete="off"
          className="absolute left-[-9999px]"
          name="website"
          tabIndex={-1}
        />
        <div>
          <label
            htmlFor="issue-category"
            className="mb-1 block text-sm font-semibold"
          >
            Issue type
          </label>
          <ReportSelect
            id="issue-category"
            name="category"
            defaultValue=""
            ref={categoryRef}
            required
          >
            <option value="" disabled>
              Choose an issue
            </option>
            {TRAIL_ISSUE_TYPES.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </ReportSelect>
        </div>

        <div>
          <label
            htmlFor="issue-comment"
            className="mb-1 block text-sm font-semibold"
          >
            Comment{' '}
            <span className="font-normal text-gray-600">(optional)</span>
          </label>
          <textarea
            className="w-full rounded-lg border border-gray-300 bg-white p-3 text-base"
            id="issue-comment"
            name="comment"
            maxLength={ISSUE_COMMENT_LIMIT}
            placeholder="Where on the trail is it?"
            rows={3}
          />
        </div>

        <div>
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- This preview is a local object URL.
            <img
              alt="Photo preview"
              className="mb-2 max-h-40 rounded-lg object-contain"
              src={photoUrl}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <label className="relative flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-semibold focus-within:ring-2 focus-within:ring-app-primary">
              <FontAwesomeIcon aria-hidden="true" icon={faCamera} />
              {photo ? 'Replace photo' : 'Add photo (optional)'}
              <input
                aria-label={photo ? 'Replace photo' : 'Add photo (optional)'}
                accept="image/*"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                disabled={isPreparingPhoto || isSubmitting}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void choosePhoto(file);
                }}
                type="file"
              />
            </label>
            {photo && (
              <button
                className="min-h-12 cursor-pointer rounded-lg px-3 text-sm hover:bg-gray-100"
                disabled={isPreparingPhoto || isSubmitting}
                onClick={() => setPhoto(null)}
                type="button"
              >
                Remove photo
              </button>
            )}
          </div>
          {isPreparingPhoto && (
            <p className="mt-1 text-sm text-gray-600" role="status">
              Preparing photo…
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button
          className="min-h-12 w-full cursor-pointer rounded-xl bg-emerald-600 px-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
          disabled={isPreparingPhoto || isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Sending…' : 'Send report'}
        </button>
        <p className="text-center text-xs text-gray-600">
          Your report goes to the trail stewards.
        </p>
      </form>
    </dialog>
  );
}

async function preparePhoto(file: File): Promise<File> {
  if (file.size > 25_000_000) throw new Error('Original photo is too large.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      ISSUE_PHOTO_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cannot prepare a photo.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.84);
    });
    if (!jpeg || jpeg.size > ISSUE_PHOTO_MAX_BYTES)
      throw new Error('Photo is too large.');
    return new File([jpeg], 'trail-issue.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
