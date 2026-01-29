import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { localResources } from '@/data/geo_data';
import type { ExternalLinkProps } from './types';

function ExternalLink({ href, children }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="external-link"
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
  return (
    <div className="section-container">
      <h3 className="section-title">Information</h3>
      <div className="section-items">
        {localResources.map((resource) => (
          <div key={resource.name} className="card">
            <div className="card-header">
              <div className="card-icon-container" data-color={resource.color}>
                <FontAwesomeIcon
                  icon={resource.icon}
                  className="card-icon"
                  data-color={resource.color}
                />
              </div>
              <span className="card-title">{resource.name}</span>
            </div>
            <div className="card-description">
              {renderDescriptionWithLink(
                resource.description,
                resource.url,
                resource.description.includes('iFixit')
                  ? 'iFixit'
                  : resource.name,
              )}
            </div>
            {resource.secondaryDescription &&
              resource.secondaryUrl &&
              resource.secondaryLinkText && (
                <div className="card-description">
                  {renderDescriptionWithLink(
                    resource.secondaryDescription,
                    resource.secondaryUrl,
                    resource.secondaryLinkText,
                  )}
                </div>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
