import type { ComponentPropsWithRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

export function ReportSelect(props: ComponentPropsWithRef<'select'>) {
  return (
    <div className="relative">
      <select
        {...props}
        className="min-h-12 w-full appearance-none rounded-lg border border-gray-300 bg-white py-2 pr-11 pl-3 text-base text-app-ink focus:border-app-primary focus:ring-2 focus:ring-app-primary/30"
      />
      <FontAwesomeIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-app-ink"
        icon={faChevronDown}
      />
    </div>
  );
}
