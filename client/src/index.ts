import assert from 'node:assert';
import * as Misskey from 'misskey-js';

/** to improve param suggestion */
type Request = <E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']>(
	endpoint: E, params: P, credential?: string | null
) => Promise<Misskey.Endpoints[E]['res']>;

const ADMIN_PARAMS = { username: 'admin', password: 'admin' };

/**
 * sign in
 * @param host server's FQDN
 * @param params sign in request params
 * @returns sign in response
 */
async function signin(host: string, params: Misskey.entities.SigninRequest): Promise<Misskey.entities.SigninResponse> {
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
	});
}

/**
 * create admin account
 * @param host server's FQDN
 * @returns admin account information if created, otherwise unspecified
 */
async function createAdmin(host: string): Promise<Misskey.entities.SignupResponse | void> {
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
			return;
		}
		throw err;
	});
}

/**
 * fetch admin account and their client
 * @param host server's FQDN
 * @returns admin account information and their client
 */
async function fetchAdmin(host: string): Promise<[Misskey.entities.SigninResponse, Misskey.api.APIClient]> {
	const admin = await signin(host, ADMIN_PARAMS)
		.catch(async err => {
			// not found error
			if (err.id === '6cc579cc-885d-43d8-95c2-b8c7fc963280') {
				await createAdmin(host);

				// wait for 1 secound to prevent hit rate limit
				await new Promise(resolve => setTimeout(resolve, 1000));
				return await signin(host, ADMIN_PARAMS);
			}
			// hit rate limit
			else if (err.id === '22d05606-fbcf-421a-a2db-b32610dcfd1b') {
				// wait for 1 secound to prevent hit rate limit
				await new Promise(resolve => setTimeout(resolve, 1000));
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

async function resolveAdmin(from: string, to: string, fromClient?: Misskey.api.APIClient): Promise<Misskey.entities.ApShowResponse & { type: 'User' }> {
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

const [oneAdmin, oneAdminClient] = await fetchAdmin('one.local');
const [twoAdmin, twoAdminClient] = await fetchAdmin('two.local');

const [twoAdminInOneServer, oneAdminInTwoServer] = await Promise.all([
	resolveAdmin('one.local', 'two.local', oneAdminClient),
	resolveAdmin('two.local', 'one.local', twoAdminClient),
]);

// follow @admin@one.local ==> @admin@two.local
console.log(`Following @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local ...`);
await (oneAdminClient.request as Request)('following/create', { userId: twoAdminInOneServer.object.id });
console.log(`Followed @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local`);

// wait for 1 secound
await new Promise(resolve => setTimeout(resolve, 1000));

await Promise.all([
	assert.equal(
		(await (oneAdminClient.request as Request)('users/following', { userId: oneAdmin.id }))
			.some(v => v.followeeId === twoAdminInOneServer.object.id),
		true,
	),
	assert.equal(
		(await (twoAdminClient.request as Request)('users/followers', { userId: twoAdmin.id }))
			.some(v => v.followerId === oneAdminInTwoServer.object.id),
		true,
	),
]);

// unfollow @admin@one.local ==> @admin@two.local
console.log(`Unfollowing @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local ...`);
await (oneAdminClient.request as Request)('following/delete', { userId: twoAdminInOneServer.object.id });
console.log(`Unfollowed @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local`);

// wait for 1 secound
await new Promise(resolve => setTimeout(resolve, 1000));

await Promise.all([
	assert.equal(
		(await (oneAdminClient.request as Request)('users/following', { userId: oneAdmin.id }))
			.some(v => v.followeeId === twoAdminInOneServer.object.id),
		false,
	),
	assert.equal(
		(await (twoAdminClient.request as Request)('users/followers', { userId: twoAdmin.id }))
			.some(v => v.followerId === oneAdminInTwoServer.object.id),
		false,
	),
]);
