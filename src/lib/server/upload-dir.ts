import { env } from '$env/dynamic/private';
import { uploadDir } from './uploads';

/** Folder for uploaded files: UPLOAD_DIR, or `uploads/` next to the database. */
export const uploads = () => uploadDir(env.DATABASE_URL ?? 'myfam.db', env.UPLOAD_DIR);
