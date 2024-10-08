import assert from 'node:assert';
import fs from 'node:fs/promises';
import * as Misskey from 'misskey-js';
import { SwitchCaseResponseType } from 'misskey-js/api.types.js';

/** to improve param suggestion */
export type Request = <E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']>(
	endpoint: E, params: P, credential?: string | null
) => Promise<SwitchCaseResponseType<E, P>>;

export const ADMIN_PARAMS = { username: 'admin', password: 'admin' };

/**
 * sign in
 * @param host server's FQDN
 * @param params sign in request params
 * @returns sign in response
 */
export async function signin(host: string, params: Misskey.entities.SigninRequest): Promise<Misskey.entities.SigninResponse> {
	// wait for 1 second to prevent hit rate limit
	await new Promise(resolve => setTimeout(resolve, 1000));
	console.log(`Sign in to @${params.username}@${host} ...`);
	return await (new Misskey.api.APIClient({
		origin: `https://${host}`,
		/**
		 * workaround for https://github.com/misskey-dev/misskey/issues/14502
		 * TODO: this would be resolved in version > 2024.8.0
		 */
		fetch: (input, init) => fetch(input, {
			...init,
			headers: {
				...init?.headers,
				'Content-Type': init?.headers['Content-Type'] != null ? init.headers['Content-Type'] : 'application/json',
			},
		}),
	}).request as Request)('signin', params).then(res => {
		console.log(`Signed in to @${params.username}@${host}`);
		return res;
	}).catch(async err => {
		if (err.id === '22d05606-fbcf-421a-a2db-b32610dcfd1b') {
			return await signin(host, params);
		}
		throw err;
	});
}

/**
 * create admin account
 * @param host server's FQDN
 * @returns admin account information if created, otherwise unspecified
 */
async function createAdmin(host: string): Promise<Misskey.entities.SignupResponse | undefined> {
	const client = new Misskey.api.APIClient({ origin: `https://${host}` });
	return await (
		client.request as Request
	)('admin/accounts/create', ADMIN_PARAMS).then(res => {
		console.log(`Successfully created admin account: @${ADMIN_PARAMS.username}@${host}`);
		return res as Misskey.entities.SignupResponse;
	}).then(async res => {
		await (client.request as Request)('admin/roles/update-default-policies', {
			policies: {
				rateLimitFactor: 0 as never,
			},
		}, res.token);
		return res;
	}).catch(err => {
		if (err.info.e.message === 'access denied') {
			console.log(`Admin account already exists: @${ADMIN_PARAMS.username}@${host}`);
			return undefined;
		}
		throw err;
	});
}

/**
 * fetch admin account and their client
 * @param host server's FQDN
 * @returns admin account information and their client
 */
export async function fetchAdmin(host: string): Promise<[Misskey.entities.SigninResponse, Misskey.api.APIClient]> {
	const admin = await signin(host, ADMIN_PARAMS)
		.catch(async err => {
			// not found error
			if (err.id === '6cc579cc-885d-43d8-95c2-b8c7fc963280') {
				await createAdmin(host);

				return await signin(host, ADMIN_PARAMS);
			}
			// hit rate limit
			else if (err.id === '22d05606-fbcf-421a-a2db-b32610dcfd1b') {
				return await signin(host, ADMIN_PARAMS);
			}
			throw err;
		});
	const adminClient = new Misskey.api.APIClient({
		origin: `https://${host}`,
		credential: admin.i,
	});
	return [admin, adminClient];
}

export async function resolveAdmin(from: string, to: string, fromClient?: Misskey.api.APIClient): Promise<Misskey.entities.ApShowResponse & { type: 'User' }> {
	const fromAdminClient: Misskey.api.APIClient = fromClient ?? (await fetchAdmin(from))[1];
	return new Promise<Misskey.entities.ApShowResponse & { type: 'User' }>((resolve, reject) => {
		console.log(`Resolving @${ADMIN_PARAMS.username}@${to} from ${from} ...`);
		(fromAdminClient.request as Request)('ap/show', { uri: `https://${to}/@${ADMIN_PARAMS.username}` })
			.then(res => {
				console.log(`Resolved @${ADMIN_PARAMS.username}@${to} from ${from}`);
				assert.equal(res.type, 'User');
				assert.equal(res.object.url, `https://${to}/@${ADMIN_PARAMS.username}`);
				// @ts-expect-error we checked above assertion
				resolve(res);
			})
			.catch(err => reject(err));
	});
}

export async function uploadFile(host: string, path: string, token: string): Promise<Misskey.entities.DriveFile> {
	const filename = path.split('/').pop() ?? 'untitled';
	const blob = new Blob([await fs.readFile(path)]);

	const body = new FormData();
	body.append('i', token);
	body.append('force', 'true');
	body.append('file', blob);
	body.append('name', filename);

	return new Promise<Misskey.entities.DriveFile>((resolve, reject) => {
		fetch(`https://${host}/api/drive/files/create`, {
			method: 'POST',
			body,
		}).then(async res => {
			resolve(await res.json());
		}).catch(err => {
			reject(err);
		});
	});
}

export function generateRandomUsername(): string {
	return crypto.randomUUID().replaceAll('-', '').substring(0, 20);
}

export async function createAccount(host: string, adminClient: Misskey.api.APIClient): Promise<[Misskey.entities.SigninResponse, Misskey.api.APIClient]> {
	const username = generateRandomUsername();
	const password = crypto.randomUUID().replaceAll('-', '');
	await (adminClient.request as Request)('admin/accounts/create', { username, password });
	console.log(`Created an account: @${username}@${host}`);
	const signinRes = await signin(host, { username, password });

	return [signinRes, new Misskey.api.APIClient({ origin: `https://${host}`, credential: signinRes.i })];
}
