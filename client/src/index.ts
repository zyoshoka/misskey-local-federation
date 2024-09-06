import { deepEqual } from 'node:assert';
import { before, describe, test } from 'node:test';
import { ADMIN_PARAMS, fetchAdmin, type Request, resolveAdmin } from './utils.js';

const [
	[oneAdmin, oneAdminClient],
	[twoAdmin, twoAdminClient],
] = await Promise.all([
	fetchAdmin('one.local'),
	fetchAdmin('two.local'),
]);

const [twoAdminInOneServer, oneAdminInTwoServer] = await Promise.all([
	resolveAdmin('one.local', 'two.local', oneAdminClient),
	resolveAdmin('two.local', 'one.local', twoAdminClient),
]);

describe('Follow @admin@one.local ==> @admin@two.local', async () => {
	before(async () => {
		console.log(`Following @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local ...`);
		await (oneAdminClient.request as Request)('following/create', { userId: twoAdminInOneServer.object.id });
		console.log(`Followed @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local`);

		// wait for 1 secound
		await new Promise(resolve => setTimeout(resolve, 1000));
	});

	test('Check consistency with `users/following` and `users/followers` endpoints', async () => {
		await Promise.all([
			deepEqual(
				(await (oneAdminClient.request as Request)('users/following', { userId: oneAdmin.id }))
					.some(v => v.followeeId === twoAdminInOneServer.object.id),
				true,
			),
			deepEqual(
				(await (twoAdminClient.request as Request)('users/followers', { userId: twoAdmin.id }))
					.some(v => v.followerId === oneAdminInTwoServer.object.id),
				true,
			),
		]);
	});
});

describe('Unfollow @admin@one.local ==> @admin@two.local', async () => {
	before(async () => {
		console.log(`Unfollowing @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local ...`);
		await (oneAdminClient.request as Request)('following/delete', { userId: twoAdminInOneServer.object.id });
		console.log(`Unfollowed @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local`);

		// wait for 1 secound
		await new Promise(resolve => setTimeout(resolve, 1000));
	});

	test('Check consistency with `users/following` and `users/followers` endpoints', async () => {
		await Promise.all([
			deepEqual(
				(await (oneAdminClient.request as Request)('users/following', { userId: oneAdmin.id }))
					.some(v => v.followeeId === twoAdminInOneServer.object.id),
				false,
			),
			deepEqual(
				(await (twoAdminClient.request as Request)('users/followers', { userId: twoAdmin.id }))
					.some(v => v.followerId === oneAdminInTwoServer.object.id),
				false,
			),
		]);
	});
});
