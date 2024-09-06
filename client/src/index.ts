import assert from 'node:assert';
import { ADMIN_PARAMS, fetchAdmin, type Request, resolveAdmin } from './utils.js';

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
