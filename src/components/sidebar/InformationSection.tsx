import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronRight,
  faChevronDown,
} from '@fortawesome/free-solid-svg-icons';
import { localResources } from '@/data/geo_data';
import { SidebarCard } from './SidebarCard';

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const isExternal = href.startsWith('http');
  return (
    <a
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="text-blue-500 no-underline font-medium hover:underline"
    >
      {children}
    </a>
  );
}

function renderDescriptionWithLink(
  description: string,
  url: string,
  linkText: string,
) {
  const parts = description.split(linkText);
  if (parts.length === 2) {
    return (
      <>
        {parts[0]}
        <ExternalLink href={url}>{linkText}</ExternalLink>
        {parts[1]}
      </>
    );
  }
  return description;
}

export function InformationSection() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-6">
      <div
        className="text-sm font-medium mb-2 text-gray-600 cursor-pointer flex items-center select-none hover:text-blue-600"
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <span className="text-[10px] mr-1.5 inline-block w-3.5 shrink-0">
          <FontAwesomeIcon
            icon={isExpanded ? faChevronDown : faChevronRight}
            className="text-[10px]"
          />
        </span>
        About
      </div>
      {isExpanded && (
        <div className="flex flex-col gap-2">
          {localResources.map((resource) => (
            <SidebarCard
              key={resource.name}
              colorTheme={resource.colorTheme}
              icon={resource.icon}
              title={resource.name}
              description={
                <>
                  {renderDescriptionWithLink(
                    resource.description,
                    resource.url,
                    resource.description.includes('iFixit')
                      ? 'iFixit'
                      : resource.name,
                  )}
                  {resource.secondaryDescription &&
                    resource.secondaryUrl &&
                    resource.secondaryLinkText && (
                      <div className="mt-1">
                        {renderDescriptionWithLink(
                          resource.secondaryDescription,
                          resource.secondaryUrl,
                          resource.secondaryLinkText,
                        )}
                      </div>
                    )}
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
