import axios from 'axios';
import { toTitleCase } from '@/utils/formatters';

/** Create user */
const postUser = async (body) => {
  body.firstName = toTitleCase(body.firstName);
  body.lastName = toTitleCase(body.lastName);
  const response = await axios.post('/api/sign-up', body);
  return response;
};

/** Get all users (PII — admin-only views should guard on server) */
const getUsers = async () => {
  const response = await axios.get('/api/users');
  return response;
};

/** Get single user by query string (_id | email | whatsapp) */
const getUser = async (query = '') => {
  const response = await axios.get(`/api/user?${query}`);
  return response;
};

/** Update user document */
const updateUser = async (userId, userData) => {
  if (Object.hasOwn(userData, 'firstName')) userData.firstName = toTitleCase(userData.firstName);
  if (Object.hasOwn(userData, 'lastName'))  userData.lastName  = toTitleCase(userData.lastName);
  if (Object.hasOwn(userData, 'gender'))    userData.gender    = userData.gender.toLowerCase();
  const { data } = await axios.put(`/api/user/${userId}`, userData);
  return data;
};

/**
 * Server-driven, paginated fetch of students with their class details.
 * Query params:
 *   - page (1-based), limit
 *   - level: number | "conversation" | "ielts" (optional)
 *   - q: text search over first/last/email (optional)
 * Returns: { items, total, page, limit }
 */
const getStudentsWithClasses = async ({ page = 1, limit = 100, level = null, q = '' } = {}) => {
  const { data } = await axios.get('/api/students-with-classes', {
    params: {
      page,
      limit,
      ...(level !== null ? { level } : {}),
      ...(q ? { q } : {})
    }
  });
  return data;
};

/** Deprecated: per-student class fetch; prefer getStudentsWithClasses() */
const getStudentsClasses = async (studentId) => {
  const { data } = await axios.get(`/api/students-classes/${studentId}`);
  return data;
};

const getStudentsForExport = async () => {
  const { data } = await axios.get('/api/students-export');
  return data;
};

const deleteUser = async (userId) => {
  const { data } = await axios.delete(`/api/user/${userId}`);
  return data;
};

export {
  postUser,
  getUsers,
  getUser,
  updateUser,
  getStudentsWithClasses,
  getStudentsClasses, // deprecated
  getStudentsForExport,
  deleteUser,
};