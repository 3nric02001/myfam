import { env } from '$env/dynamic/private';
import { db } from './db';
import { vapidKeys, vapidSubject, webPushSender, type Sender } from './push';

/** The push sender of this installation, for notifications sent right away from an action. */
export function appSender(): Sender {
	return webPushSender(vapidKeys(db, env), vapidSubject(env));
}
