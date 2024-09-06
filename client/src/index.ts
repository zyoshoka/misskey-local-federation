import { deepEqual, deepStrictEqual } from 'node:assert';
import { before, describe, test } from 'node:test';
import * as Misskey from 'misskey-js';
import { ADMIN_PARAMS, fetchAdmin, type Request, resolveAdmin, uploadFile } from './utils.js';

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

describe('Follow / Unfollow', async () => {
	await describe('Follow @admin@one.local ==> @admin@two.local', async () => {
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

	await describe('Unfollow @admin@one.local ==> @admin@two.local', async () => {
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
});

describe('Drive', () => {
	describe('Upload in one.local and resolve from two.local', async () => {
		const whiteImage = await uploadFile('one.local', './assets/white.webp', oneAdmin.i);
		const noteWithWhiteImage = (await (oneAdminClient.request as Request)('notes/create', { fileIds: [whiteImage.id] })).createdNote;
		const uri = `https://one.local/notes/${noteWithWhiteImage.id}`;
		const noteInTwoServer = await (async (): Promise<Misskey.entities.ApShowResponse & { type: 'Note' }> => {
			const resolved = await (twoAdminClient.request as Request)('ap/show', { uri });
			deepEqual(resolved.type, 'Note');
			// @ts-expect-error we checked above assertion
			return resolved;
		})();
		deepEqual(noteInTwoServer.object.uri, uri);
		deepEqual(noteInTwoServer.object.files != null, true);
		deepEqual(noteInTwoServer.object.files!.length, 1);
		const whiteImageInTwoServer = noteInTwoServer.object.files![0];

		test('Check consistency of DriveFile', () => {
			console.log(`one.local: ${JSON.stringify(whiteImage, null, '\t')}`);
			console.log(`two.local: ${JSON.stringify(whiteImageInTwoServer, null, '\t')}`);

			const toBeDeleted: (keyof Misskey.entities.DriveFile)[] = [
				'id',
				'createdAt',
				'size',
				'url',
				'thumbnailUrl',
				'userId',
			];
			const _whiteImage: Partial<Misskey.entities.DriveFile> = structuredClone(whiteImage);
			const _whiteImageInTwoServer: Partial<Misskey.entities.DriveFile> = structuredClone(whiteImageInTwoServer);

			for (const image of [_whiteImage, _whiteImageInTwoServer]) {
				for (const field of toBeDeleted) {
					delete image[field];
				}
			}

			deepStrictEqual(_whiteImage, _whiteImageInTwoServer);
		});
	});
});
