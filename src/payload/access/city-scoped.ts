import type { Access, FieldAccess } from 'payload';

/**
 * Read/update/delete access for content that already belongs to a city.
 * Collection queries constrain the existing document before mutation.
 */
export const accessAssignedCity: Access = ({ req }) => {
  const user = req.user;
  if (!user) {
    return false;
  }
  if (user.role === 'admin') {
    return true;
  }
  return user.city ? { city: { equals: user.city } } : false;
};

/** Create access must be a boolean and must validate the submitted city. */
export const createInAssignedCity: Access = ({ data, req }) => {
  const user = req.user;
  if (!user) {
    return false;
  }
  if (user.role === 'admin') {
    return true;
  }
  return Boolean(user.city && data?.city === user.city);
};

/** A scoped user cannot move an existing document into another city. */
export const canChangeCity: FieldAccess = ({ req }) =>
  req.user?.role === 'admin';
